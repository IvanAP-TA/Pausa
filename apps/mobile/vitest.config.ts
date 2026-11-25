import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@pausa/api-types": path.resolve(__dirname, "../../packages/api-types/src/index.ts"),
      "@messages": path.resolve(__dirname, "../../packages/messages"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
