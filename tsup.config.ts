import { defineConfig } from "tsup";

// 런타임 이미지에 node_modules 없이 dist만 복사하도록 의존성까지 전부 번들
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  noExternal: [/.*/],
  clean: true,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
