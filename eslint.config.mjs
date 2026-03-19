import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
import eslintConfigPrettier from "eslint-config-prettier"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintConfigPrettier,
  {
    rules: {
      // Legacy codebase uses `any` extensively — warn for now, error later
      "@typescript-eslint/no-explicit-any": "warn",
      // Spanish UI text contains unescaped quotes — warn for now
      "react/no-unescaped-entities": "warn",
      // TODO: Upgrade to "error" once existing unused vars are cleaned up (181 instances)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
]

export default eslintConfig
