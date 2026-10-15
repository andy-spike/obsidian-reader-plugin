import parser from "@typescript-eslint/parser";
import typescript from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

// Keep the directory review's source checks runnable before publishing.
export default [{
  files: ["src/**/*.ts"],
  languageOptions: { parser, parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname } },
  plugins: { "@typescript-eslint": typescript, obsidianmd },
  rules: {
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-argument": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/unbound-method": "error",
    "obsidianmd/no-global-this": "error",
    "obsidianmd/no-forbidden-elements": "error",
    "obsidianmd/no-static-styles-assignment": "error",
    "obsidianmd/prefer-window-timers": "error",
    "obsidianmd/settings-tab/prefer-setting-definitions": "error",
    "obsidianmd/settings-tab/prefer-update-over-display": "error",
    "obsidianmd/settings-tab/no-deprecated-display": "error",
  },
}];
