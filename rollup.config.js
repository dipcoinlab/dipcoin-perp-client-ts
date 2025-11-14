import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

var rollup_config = [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/index.cjs.js",
        format: "cjs",
        sourcemap: true,
        exports: "auto",
      },
      {
        file: "./dist/index.mjs",
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [
      nodeResolve({
        preferBuiltins: false,
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
    external: ["axios", "@mysten/sui", "@dipcoinlab/perp-ts-library", "bignumber.js", "buffer"],
  },
];
export { rollup_config as default };

