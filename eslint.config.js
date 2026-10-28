import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "site-dist", "demo", "node_modules", "examples/**/node_modules", "coverage"] },
  ...tseslint.configs.strict,
  {
    // Tests index into results they have just asserted to exist; `!` keeps them readable.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Seeded generation must not use Math.random()." },
      ],
    },
  },
);
