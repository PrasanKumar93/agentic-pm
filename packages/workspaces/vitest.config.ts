import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "scripts/**/*.mjs"],
    include: ["src/**/*.test.ts"],
  },
});
