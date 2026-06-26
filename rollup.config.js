import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

/**
 * Rollup's `external` matches against the full id by default; `@mysten/sui` 2.x
 * is consumed via subpaths (e.g. `@mysten/sui/client`), so every prefix has to
 * be externalized. Otherwise rollup tries to bundle them and fails resolving
 * their `.ts` dependencies inside node_modules.
 */
function isExternal(id) {
  if (id.startsWith("@mysten/sui")) return true;
  if (id.startsWith("@pythnetwork/")) return true;
  if (id === "@dipcoinlab/perp-ts-library" || id.startsWith("@dipcoinlab/perp-ts-library/"))
    return true;
  // Solana / CCTP stack: keep external so consumers dedupe a single copy and
  // rollup doesn't try to bundle their large dependency trees.
  if (id.startsWith("@solana/")) return true;
  if (id.startsWith("@coral-xyz/")) return true;
  if (
    id === "axios" ||
    id === "bignumber.js" ||
    id === "buffer" ||
    id === "node:buffer" ||
    id === "bs58" ||
    id === "tweetnacl" ||
    id === "ethers" ||
    id === "crypto" ||
    id === "node:crypto" ||
    id === "fs" ||
    id === "path" ||
    id === "url" ||
    id === "node:fs" ||
    id === "node:path" ||
    id === "node:url" ||
    id === "ws"
  ) {
    return true;
  }
  return false;
}

var rollup_config = [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.esm.js",
        format: "esm",
        sourcemap: true,
        exports: "named",
      },
      {
        file: "dist/index.cjs.js",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
      {
        file: "./dist/index.mjs",
        format: "es",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: [
      nodeResolve({
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "./dist",
      }),
      terser({
        compress: {
          drop_console: true,
        },
      }),
    ],
    external: isExternal,
  },
];
export { rollup_config as default };
