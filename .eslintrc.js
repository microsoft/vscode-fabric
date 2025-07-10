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
                "*.ts"
            ],
            parserOptions: {
                project: ["./tsconfig.json"]
            }
        }
    ],
    rules: {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/semi": "warn",
        "@typescript-eslint/no-floating-promises": [
            "error",
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
        semi: "off"
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