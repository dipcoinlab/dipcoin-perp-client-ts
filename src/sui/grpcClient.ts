// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Sui gRPC client for the SDK.
 *
 * Sui is migrating away from the legacy JSON-RPC fullnode API towards gRPC.
 * `@dipcoinlab/perp-ts-library` (>=0.0.32) is built against a gRPC client that
 * still exposes the old JSON-RPC-shaped method results (`getObject` →
 * `{ data }`, `getBalance` → `{ totalBalance }`, `getCoins` → `{ data }`, ...),
 * so the rest of the SDK can keep reading the familiar shapes.
 *
 * This module mirrors the compat client the library itself is designed around
 * (the library bundles an equivalent class but does not re-export it), and adds
 * a small factory + default gRPC endpoint map. It is the gRPC replacement for
 * the previous `SuiJsonRpcClient` usage.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { bcs } from "@mysten/sui/bcs";
import { BaseClient, type SuiClientTypes } from "@mysten/sui/client";
import { fromBase64, fromHex, toBase64, toHex } from "@mysten/sui/utils";
import { blake2b } from "@noble/hashes/blake2b";

type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet" | string;

export type OwnedObjectRef = {
  owner: unknown;
  reference: {
    objectId: string;
    version: string;
    digest: string;
  };
};

export type SuiTransactionBlockResponse = {
  digest: string;
  effects?: any;
  events?: any[];
  objectChanges?: any[];
  balanceChanges?: any[];
  transaction?: any;
  rawTransaction?: string;
  errors?: string[];
};

export type DryRunTransactionBlockResponse = SuiTransactionBlockResponse & {
  input?: any;
  results?: any[];
};

export type DevInspectResults = {
  events?: any[];
  effects?: any;
  results?: any[];
  error?: string;
};

type SuiObjectDataOptions = {
  showBcs?: boolean;
  showContent?: boolean;
  showDisplay?: boolean;
  showOwner?: boolean;
  showPreviousTransaction?: boolean;
  showStorageRebate?: boolean;
  showType?: boolean;
};

type TransactionResponseOptions = {
  showBalanceChanges?: boolean;
  showEffects?: boolean;
  showEvents?: boolean;
  showInput?: boolean;
  showObjectChanges?: boolean;
  showRawEffects?: boolean;
  showRawInput?: boolean;
};

export interface SuiGrpcCompatClientOptions {
  network: SuiNetwork;
  url?: string;
  baseUrl?: string;
}

function normalizeNetwork(network: SuiNetwork): SuiClientTypes.Network {
  return (network === "local" ? "localnet" : network) as SuiClientTypes.Network;
}

function objectIncludeFromOptions(options?: SuiObjectDataOptions): SuiClientTypes.ObjectInclude {
  return {
    json: options?.showContent ?? false,
    display: options?.showDisplay ?? false,
    previousTransaction: options?.showPreviousTransaction ?? false,
    objectBcs: options?.showBcs ?? false,
  };
}

function transactionIncludeFromOptions(
  options?: TransactionResponseOptions
): SuiClientTypes.TransactionInclude {
  return {
    balanceChanges: options?.showBalanceChanges ?? true,
    effects: options?.showEffects ?? true,
    events: options?.showEvents ?? true,
    objectTypes: options?.showObjectChanges ?? true,
    transaction: options?.showInput ?? true,
    bcs: options?.showRawInput ?? false,
  };
}

function mapOwner(owner: SuiClientTypes.ObjectOwner | null | undefined): unknown {
  if (!owner) return null;
  if (owner.$kind === "Immutable") return "Immutable";
  if (owner.$kind === "Shared") {
    return {
      Shared: {
        initial_shared_version: owner.Shared.initialSharedVersion,
      },
    };
  }
  if (owner.$kind === "ConsensusAddressOwner") {
    return {
      ConsensusAddressOwner: {
        owner: owner.ConsensusAddressOwner.owner,
        start_version: owner.ConsensusAddressOwner.startVersion,
      },
    };
  }
  if (owner.$kind === "AddressOwner") {
    return { AddressOwner: owner.AddressOwner };
  }
  if (owner.$kind === "ObjectOwner") {
    return { ObjectOwner: owner.ObjectOwner };
  }
  return null;
}

function mapObjectData<Include extends SuiClientTypes.ObjectInclude>(
  object: SuiClientTypes.Object<Include>,
  options?: SuiObjectDataOptions
): any {
  const data: any = {
    objectId: object.objectId,
    version: object.version,
    digest: object.digest,
  };

  if (options?.showOwner) {
    data.owner = mapOwner(object.owner);
  }
  if (options?.showType) {
    data.type = object.type;
  }
  if (options?.showPreviousTransaction) {
    data.previousTransaction = object.previousTransaction ?? null;
  }
  if (options?.showDisplay) {
    data.display = object.display ?? null;
  }
  if (options?.showBcs && object.objectBcs) {
    data.bcs = {
      dataType: object.type === "package" ? "package" : "moveObject",
      bcsBytes: toBase64(object.objectBcs),
    };
  }
  if (options?.showContent) {
    const json = object.json as Record<string, unknown> | null | undefined;
    data.content =
      json && "dataType" in json && "fields" in json
        ? json
        : {
            dataType: object.type === "package" ? "package" : "moveObject",
            type: object.type,
            hasPublicTransfer: false,
            fields: toLegacyMoveFields(json ?? {}),
          };
  }

  return data;
}

function toLegacyMoveFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, toLegacyMoveValue(key, value)])
  );
}

function toLegacyMoveValue(key: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toLegacyMoveValue("", item));
  }
  if (!value || typeof value !== "object") {
    if (key === "id" && typeof value === "string") {
      return { id: value };
    }
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  if ("fields" in objectValue) {
    return value;
  }

  return {
    fields: toLegacyMoveFields(objectValue),
  };
}

function mapObjectRef(
  change: SuiClientTypes.ChangedObject
): { objectId: string; version: string; digest: string } {
  return {
    objectId: change.objectId,
    version: change.outputVersion ?? change.inputVersion ?? "0",
    digest: change.outputDigest ?? change.inputDigest ?? "",
  };
}

function hasOutputObject(change: SuiClientTypes.ChangedObject): boolean {
  return change.outputState === "ObjectWrite" || change.outputState === "PackageWrite";
}

function hasInputObject(change: SuiClientTypes.ChangedObject): boolean {
  return (
    change.inputState !== "DoesNotExist" &&
    change.inputState !== undefined &&
    change.inputState !== null
  );
}

function mapEffects(effects: SuiClientTypes.TransactionEffects | undefined): any {
  if (!effects) return undefined;

  const created: OwnedObjectRef[] = [];
  const mutated: OwnedObjectRef[] = [];
  const deleted: Array<{ objectId: string; version: string; digest: string }> = [];
  const wrapped: Array<{ objectId: string; version: string; digest: string }> = [];

  for (const change of effects.changedObjects) {
    const ref = mapObjectRef(change);
    const owner = mapOwner(change.outputOwner ?? change.inputOwner);
    if (change.idOperation === "Created" && hasOutputObject(change)) {
      created.push({ owner, reference: ref });
    } else if (
      (change.idOperation === "Deleted" || change.outputState === "DoesNotExist") &&
      hasInputObject(change)
    ) {
      deleted.push(ref);
    } else if (hasOutputObject(change)) {
      mutated.push({ owner, reference: ref });
    } else if (change.outputState === "Unknown") {
      wrapped.push(ref);
    }
  }

  return {
    messageVersion: "v1",
    status: effects.status.success
      ? { status: "success" }
      : { status: "failure", error: effects.status.error?.message ?? "Transaction failed" },
    executedEpoch: "0",
    gasUsed: effects.gasUsed,
    transactionDigest: effects.transactionDigest,
    gasObject: effects.gasObject
      ? {
          owner: mapOwner(effects.gasObject.outputOwner ?? effects.gasObject.inputOwner),
          reference: mapObjectRef(effects.gasObject),
        }
      : undefined,
    dependencies: effects.dependencies,
    eventsDigest: effects.eventsDigest,
    created,
    mutated,
    deleted,
    wrapped,
  };
}

function mapEvent(event: SuiClientTypes.Event): any {
  return {
    id: undefined,
    packageId: event.packageId,
    transactionModule: event.module,
    sender: event.sender,
    type: event.eventType,
    parsedJson: event.json,
    bcs: toBase64(event.bcs),
  };
}

function mapObjectChanges(tx: SuiClientTypes.Transaction<any>): any[] | undefined {
  if (!tx.effects || !tx.objectTypes) return undefined;
  const sender = tx.transaction?.sender ?? "";
  return tx.effects.changedObjects.flatMap((change) => {
    const objectType = tx.objectTypes?.[change.objectId] ?? "";
    const ref = mapObjectRef(change);
    if (change.idOperation === "Created" && hasOutputObject(change)) {
      return [
        {
          type: "created",
          sender,
          owner: mapOwner(change.outputOwner),
          objectType,
          objectId: change.objectId,
          version: ref.version,
          digest: ref.digest,
        },
      ];
    }
    if (
      (change.idOperation === "Deleted" || change.outputState === "DoesNotExist") &&
      hasInputObject(change)
    ) {
      return [
        {
          type: "deleted",
          sender,
          objectType,
          objectId: change.objectId,
          version: change.inputVersion ?? ref.version,
        },
      ];
    }
    if (!hasOutputObject(change)) {
      return [];
    }
    return [
      {
        type: "mutated",
        sender,
        owner: mapOwner(change.outputOwner ?? change.inputOwner),
        objectType,
        objectId: change.objectId,
        version: ref.version,
        previousVersion: change.inputVersion,
        digest: ref.digest,
      },
    ];
  });
}

function unwrapTransactionResult(
  result: SuiClientTypes.TransactionResult<any>
): SuiClientTypes.Transaction<any> {
  return result.Transaction ?? result.FailedTransaction;
}

function mapTransactionResult(
  result: SuiClientTypes.TransactionResult<any>
): SuiTransactionBlockResponse {
  const tx = unwrapTransactionResult(result);
  return {
    digest: tx.digest,
    effects: mapEffects(tx.effects),
    events: tx.events?.map(mapEvent),
    objectChanges: mapObjectChanges(tx),
    balanceChanges: tx.balanceChanges,
    transaction: tx.transaction ?? null,
    rawTransaction: tx.bcs ? toBase64(tx.bcs) : undefined,
    errors: tx.status.success ? undefined : [tx.status.error?.message ?? "Transaction failed"],
  };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function normalizeVectorU8Value(value: unknown): number[] {
  if (typeof value === "string") {
    const bytes = value.startsWith("0x") ? fromHex(value) : new TextEncoder().encode(value);
    return Array.from(bytes);
  }
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(Number);
  throw new Error("Unsupported vector<u8> dynamic field key");
}

function encodeDynamicFieldName(type: string, value: unknown): Uint8Array {
  switch (type) {
    case "address":
      return bcs.Address.serialize(value as string).toBytes();
    case "bool":
      return bcs.bool().serialize(Boolean(value)).toBytes();
    case "u8":
      return bcs.u8().serialize(Number(value)).toBytes();
    case "u16":
      return bcs.u16().serialize(Number(value)).toBytes();
    case "u32":
      return bcs.u32().serialize(Number(value)).toBytes();
    case "u64":
      return bcs.u64().serialize(value as string | number | bigint).toBytes();
    case "u128":
      return bcs.u128().serialize(value as string | number | bigint).toBytes();
    case "u256":
      return bcs.u256().serialize(value as string | number | bigint).toBytes();
    case "vector<u8>":
      return bcs.vector(bcs.u8()).serialize(normalizeVectorU8Value(value)).toBytes();
    case "0x1::string::String":
    case "0x1::ascii::String":
    case "string":
      return bcs.string().serialize(String(value)).toBytes();
    default:
      throw new Error(`Unsupported dynamic field key type: ${type}`);
  }
}

function decodeDynamicFieldName(type: string, bytes: Uint8Array): unknown {
  try {
    switch (type) {
      case "address":
        return bcs.Address.parse(bytes);
      case "bool":
        return bcs.bool().parse(bytes);
      case "u8":
        return bcs.u8().parse(bytes);
      case "u16":
        return bcs.u16().parse(bytes);
      case "u32":
        return bcs.u32().parse(bytes);
      case "u64":
        return bcs.u64().parse(bytes).toString();
      case "u128":
        return bcs.u128().parse(bytes).toString();
      case "u256":
        return bcs.u256().parse(bytes).toString();
      case "vector<u8>": {
        const value = bcs.vector(bcs.u8()).parse(bytes);
        return new TextDecoder().decode(Uint8Array.from(value));
      }
      case "0x1::string::String":
      case "0x1::ascii::String":
      case "string":
        return bcs.string().parse(bytes);
      default:
        return toHex(bytes);
    }
  } catch {
    return toHex(bytes);
  }
}

function deriveDynamicFieldId(parentId: string, type: string, key: Uint8Array): string {
  const digest = blake2b(
    concatBytes([
      new Uint8Array([0xf0]),
      bcs.Address.serialize(parentId).toBytes(),
      bcs.u64().serialize(key.length).toBytes(),
      key,
      bcs.TypeTag.serialize(type).toBytes(),
    ]),
    { dkLen: 32 }
  );
  return `0x${toHex(digest)}`;
}

function extractCoinType(objectType: string, fallback?: string): string {
  const match = objectType.match(/^0x2::coin::Coin<(.+)>$/);
  return match?.[1] ?? fallback ?? objectType;
}

/**
 * gRPC-backed Sui client that exposes legacy JSON-RPC-shaped method results so
 * existing call sites (and `@dipcoinlab/perp-ts-library`) keep working.
 */
export class SuiGrpcCompatClient extends BaseClient {
  readonly grpc: SuiGrpcClient;
  readonly core: SuiGrpcClient["core"];

  constructor(options: SuiGrpcCompatClientOptions) {
    const network = normalizeNetwork(options.network);
    const baseUrl = options.baseUrl ?? options.url;
    if (!baseUrl) {
      throw new Error("Missing Sui gRPC URL");
    }
    super({ network });
    this.grpc = new SuiGrpcClient({
      network,
      baseUrl,
    });
    this.core = this.grpc.core;
  }

  async getChainIdentifier(options?: { signal?: AbortSignal }): Promise<string> {
    const response = await this.grpc.core.getChainIdentifier(options);
    return response.chainIdentifier;
  }

  async getObject(input: {
    id?: string;
    objectId?: string;
    options?: SuiObjectDataOptions;
    signal?: AbortSignal;
  }): Promise<any> {
    const objectId = input.objectId ?? input.id;
    if (!objectId) throw new Error("Missing object id");
    const include = objectIncludeFromOptions(input.options);

    try {
      const { object } = await this.grpc.getObject({
        objectId,
        include,
        signal: input.signal,
      });
      return { data: mapObjectData(object, input.options) };
    } catch (error) {
      return {
        error: {
          code: "notFound",
          object_id: objectId,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async multiGetObjects(input: {
    ids: string[];
    options?: SuiObjectDataOptions;
    signal?: AbortSignal;
  }): Promise<any[]> {
    const include = objectIncludeFromOptions(input.options);
    const { objects } = await this.grpc.getObjects({
      objectIds: input.ids,
      include,
      signal: input.signal,
    });
    return objects.map((object, index) => {
      if (object instanceof Error) {
        return {
          error: {
            code: "notFound",
            object_id: input.ids[index],
            message: object.message,
          },
        };
      }
      return { data: mapObjectData(object, input.options) };
    });
  }

  async getCoins(input: {
    owner: string;
    coinType?: string;
    cursor?: string | null;
    limit?: number | null;
    signal?: AbortSignal;
  }): Promise<any> {
    const response = await this.grpc.listCoins({
      owner: input.owner,
      coinType: input.coinType,
      cursor: input.cursor,
      limit: input.limit ?? undefined,
      signal: input.signal,
    });

    return {
      data: response.objects.map((coin) => ({
        coinType: extractCoinType(coin.type, input.coinType),
        coinObjectId: coin.objectId,
        version: coin.version,
        digest: coin.digest,
        balance: coin.balance,
        previousTransaction: "",
      })),
      nextCursor: response.cursor,
      hasNextPage: response.hasNextPage,
    };
  }

  async getBalance(input: { owner: string; coinType?: string; signal?: AbortSignal }): Promise<any> {
    const { balance } = await this.grpc.getBalance(input);
    return {
      coinType: balance.coinType,
      coinObjectCount: 0,
      totalBalance: balance.balance,
      lockedBalance: {},
    };
  }

  async getOwnedObjects(input: {
    owner: string;
    cursor?: string | null;
    limit?: number | null;
    options?: SuiObjectDataOptions;
    filter?: { StructType?: string };
    signal?: AbortSignal;
  }): Promise<any> {
    const objectType = input.filter?.StructType;
    const include = objectIncludeFromOptions(input.options);
    const response = await this.grpc.listOwnedObjects({
      owner: input.owner,
      cursor: input.cursor,
      limit: input.limit ?? undefined,
      type: objectType,
      include,
      signal: input.signal,
    });

    return {
      data: response.objects.map((object) => ({
        data: mapObjectData(object, input.options),
      })),
      nextCursor: response.cursor,
      hasNextPage: response.hasNextPage,
    };
  }

  async getDynamicFields(input: {
    parentId: string;
    cursor?: string | null;
    limit?: number | null;
    signal?: AbortSignal;
  }): Promise<any> {
    const response = await this.grpc.listDynamicFields({
      parentId: input.parentId,
      cursor: input.cursor,
      limit: input.limit ?? undefined,
      signal: input.signal,
    });

    return {
      data: response.dynamicFields.map((field) => ({
        name: {
          type: field.name.type,
          value: decodeDynamicFieldName(field.name.type, field.name.bcs),
        },
        bcsEncoding: "base64",
        bcsName: toBase64(field.name.bcs),
        type: field.$kind,
        objectType: field.type,
        objectId: field.childId ?? field.fieldId,
        version: "",
        digest: "",
      })),
      nextCursor: response.cursor,
      hasNextPage: response.hasNextPage,
    };
  }

  async getDynamicFieldObject(input: {
    parentId: string;
    name: { type: string; value: unknown };
    signal?: AbortSignal;
  }): Promise<any> {
    const nameBcs = encodeDynamicFieldName(input.name.type, input.name.value);
    const fieldId = deriveDynamicFieldId(input.parentId, input.name.type, nameBcs);
    const object = await this.getObject({
      id: fieldId,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
        showPreviousTransaction: true,
      },
      signal: input.signal,
    });

    if (object.error) {
      return {
        error: {
          code: "dynamicFieldNotFound",
          parentId: input.parentId,
          name: input.name,
        },
      };
    }

    return object;
  }

  async signAndExecuteTransaction(input: {
    signer: any;
    transaction: any;
    options?: TransactionResponseOptions;
    additionalSignatures?: string[];
    signal?: AbortSignal;
  }): Promise<SuiTransactionBlockResponse> {
    const result = await this.grpc.signAndExecuteTransaction({
      signer: input.signer,
      transaction: input.transaction,
      additionalSignatures: input.additionalSignatures,
      include: transactionIncludeFromOptions(input.options),
      signal: input.signal,
    });
    return mapTransactionResult(result);
  }

  async executeTransaction(input: {
    transaction: Uint8Array;
    signatures: string[];
    options?: TransactionResponseOptions;
    signal?: AbortSignal;
  }): Promise<SuiTransactionBlockResponse> {
    const result = await this.grpc.executeTransaction({
      transaction: input.transaction,
      signatures: input.signatures,
      include: transactionIncludeFromOptions(input.options),
      signal: input.signal,
    });
    return mapTransactionResult(result);
  }

  async waitForTransaction(input: {
    digest: string;
    options?: TransactionResponseOptions;
    timeout?: number;
    pollSchedule?: number[];
    signal?: AbortSignal;
  }): Promise<SuiTransactionBlockResponse> {
    const result = await this.grpc.waitForTransaction({
      digest: input.digest,
      include: transactionIncludeFromOptions(input.options),
      timeout: input.timeout,
      pollSchedule: input.pollSchedule,
      signal: input.signal,
    });
    return mapTransactionResult(result);
  }

  async dryRunTransactionBlock(input: {
    transactionBlock: string | Uint8Array;
    signal?: AbortSignal;
  }): Promise<DryRunTransactionBlockResponse> {
    const transaction =
      typeof input.transactionBlock === "string"
        ? fromBase64(input.transactionBlock)
        : input.transactionBlock;
    const result = await this.grpc.simulateTransaction({
      transaction,
      include: {
        balanceChanges: true,
        effects: true,
        events: true,
        objectTypes: true,
        transaction: true,
        commandResults: true,
      },
      signal: input.signal,
    });
    const mapped = mapTransactionResult(result);
    return {
      ...mapped,
      input: mapped.transaction,
      results: result.commandResults as any[] | undefined,
    };
  }
}

/** Default Sui gRPC fullnode endpoints per network. */
const SUI_GRPC_BASE_URLS: Record<"mainnet" | "testnet" | "devnet" | "localnet", string> = {
  localnet: "http://127.0.0.1:9000",
  devnet: "https://fullnode.devnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

/** Resolve the default gRPC base URL for a network. */
export function getSuiGrpcBaseUrl(network: SuiNetwork): string {
  const key = normalizeNetwork(network) as keyof typeof SUI_GRPC_BASE_URLS;
  return SUI_GRPC_BASE_URLS[key] ?? SUI_GRPC_BASE_URLS.testnet;
}

/**
 * Factory for the SDK's Sui gRPC client.
 * @param network Target network.
 * @param baseUrl Optional override (e.g. a self-hosted gRPC-Web reverse proxy).
 */
export function createSuiGrpcClient(
  network: SuiNetwork,
  baseUrl?: string
): SuiGrpcCompatClient {
  return new SuiGrpcCompatClient({
    network,
    baseUrl: baseUrl || getSuiGrpcBaseUrl(network),
  });
}

export { SuiGrpcCompatClient as SuiClient };
