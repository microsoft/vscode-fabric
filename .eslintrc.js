module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
    },
    plugins: [
        "@typescript-eslint"
    ],
    overrides: [
        {
            files: [
                "*.ts",
                "api/**/*.ts",
                "extension/**/*.ts",
                "util/**/*.ts"
            ],
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: [
                    "./tsconfig.json",
                    "./api/tsconfig.json",
                    "./extension/tsconfig.json",
                    "./util/tsconfig.json"
                ]
            }
        },
        {
            files: ["api/test/**/*.ts"],
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: ["./api/tsconfig.test.json"]
            }
        },
        {
            files: ["util/test/**/*.ts"],
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: ["./util/tsconfig.test.json"]
            }
        },
        {
            files: ["extension/test/**/*.ts"],
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: ["./extension/tsconfig.test.json"]
            }
        },
        {
            files: ["**/*.test.ts", "**/*.spec.ts"],
            rules: {
                "security/detect-object-injection": "off"
            }
        }
    ],
    rules: {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/semi": "warn",
        "@typescript-eslint/no-floating-promises": [
            "warn",
            {
                ignoreVoid: true,
                ignoreIIFE: true
            }
        ],
        "brace-style": [
            "warn",
            "stroustrup"
        ],
        curly: "warn",
        eqeqeq: "warn",
        indent: [
            "warn",
            4,
            {
                SwitchCase: 1
            }
        ],
        "no-throw-literal": "warn",
        quotes: [
            "warn",
            "single",
            "avoid-escape"
        ],
        semi: "off",
        // Additional formatting rules
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
    },
    ignorePatterns: [
        "out",
        "dist",
        "**/*.d.ts",
        "samples",
        "**/*.js"
    ],
    extends: [
        "plugin:security/recommended-legacy"
    ]
};
