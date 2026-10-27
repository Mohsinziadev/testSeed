import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { testseed: fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    typecheck: { enabled: true, include: ["tests/types/**/*.test-d.ts"], tsconfig: "./tsconfig.json" },
  },
});
