import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@services": path.resolve(__dirname, "src/services"),
      "@db": path.resolve(__dirname, "src/db"),
      "@routes": path.resolve(__dirname, "src/routes"),
    },
  },
});
