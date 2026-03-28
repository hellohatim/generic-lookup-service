import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    /** Contract checks use Node's built-in `node:test` via `npm run test:contract` */
    exclude: ["**/node_modules/**", "**/dist/**", "**/scripts/**"],
  },
});
