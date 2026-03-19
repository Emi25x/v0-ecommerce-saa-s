import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    include: [
      "domains/**/__tests__/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["domains/**/*.ts", "lib/**/*.ts"],
      exclude: ["**/__tests__/**", "**/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
