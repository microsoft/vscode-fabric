// @ts-check
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const securityPlugin = require("eslint-plugin-security");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
    {
        ignores: [
            "**/out/**",
            "**/dist/**",
            "**/*.d.ts",
            "**/samples/**",
            "**/*.js"
        ]
    },
    {
        files: ["**/*.ts"],
        ...securityPlugin.configs.recommended,
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                tsconfigRootDir: __dirname,
                project: [
                    "./tsconfig.json",
                    "./api/tsconfig.json",
                    "./api/tsconfig.test.json",
                    "./extension/tsconfig.json",
                    "./extension/tsconfig.test.json",
                    "./util/tsconfig.json",
                    "./util/tsconfig.test.json"
                ]
            }
        },
        plugins: {
            "@typescript-eslint": tsPlugin
        },
        rules: {
            "@typescript-eslint/naming-convention": "warn",
            "@typescript-eslint/no-floating-promises": [
                "warn",
                {
                    ignoreVoid: true,
                    ignoreIIFE: true
                }
            ],
            "brace-style": ["warn", "stroustrup"],
            "curly": "warn",
            "eqeqeq": "warn",
            "indent": ["warn", 4, { SwitchCase: 1 }],
            "no-throw-literal": "warn",
            "quotes": ["warn", "single", "avoid-escape"],
            "semi": "off",
            "no-trailing-spaces": "warn",
            "eol-last": ["warn", "always"],
            "no-multiple-empty-lines": ["warn", { "max": 1, "maxEOF": 0 }],
            "comma-dangle": ["warn", {
                "arrays": "always-multiline",
                "objects": "always-multiline",
                "imports": "always-multiline",
                "exports": "always-multiline",
                "functions": "never"
            }],
            "space-before-function-paren": ["warn", {
                "anonymous": "always",
                "named": "never",
                "asyncArrow": "always"
            }],
            "arrow-spacing": ["warn", { "before": true, "after": true }],
            "keyword-spacing": ["warn", { "before": true, "after": true }],
            "space-infix-ops": "warn",
            "object-curly-spacing": ["warn", "always"],
            "array-bracket-spacing": ["warn", "never"],
            "max-len": ["warn", { "code": 240 }]
        }
    },
    {
        files: ["**/*.test.ts", "**/*.spec.ts"],
        rules: {
            "security/detect-object-injection": "off"
        }
    }
];
