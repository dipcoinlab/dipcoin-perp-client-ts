import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

/**
 * Rollup `external` 默认按整串匹配；`@mysten/sui` 2.x 的入口是子路径（如 `@mysten/sui/client`），
 * 必须全部标为 external，否则会尝试打入 node_modules 并触发对 `.ts` 依赖解析失败等问题。
 */
function isExternal(id) {
  if (id.startsWith("@mysten/sui")) return true;
  if (id.startsWith("@pythnetwork/")) return true;
  if (id === "@dipcoinlab/perp-ts-library" || id.startsWith("@dipcoinlab/perp-ts-library/"))
    return true;
  if (
    id === "axios" ||
    id === "bignumber.js" ||
    id === "buffer" ||
    id === "node:buffer" ||
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
