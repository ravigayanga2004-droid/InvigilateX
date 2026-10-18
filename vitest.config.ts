import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src") } },
  test: { include: ["tests/unit/**/*.test.{ts,tsx}"], environment: "node" },
});
