import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/api/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
  },
});
