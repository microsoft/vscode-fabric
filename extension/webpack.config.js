//@ts-check

'use strict';

const path = require('path');

const di = require('@wessberg/di-compiler');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode',
        'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics', // ignored because we don't ship native module
        '@azure/functions-core': 'commonjs @azure/functions-core', // ignored because we don't ship this module
        '@opentelemetry/instrumentation': 'commonjs @opentelemetry/instrumentation', // ignored because we don't ship this module
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@microsoft/vscode-fabric-api': path.resolve(__dirname, '../api/src/'),
            '@microsoft/vscode-fabric-util': path.resolve(__dirname, '../util/src/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                // Exclude node_modules and the ephemeral UI test extension output folder which can
                // otherwise confuse production bundling when it exists (contains its own package.json etc.)
                exclude: [/node_modules/, /out\/\.test-extensions/],
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            getCustomTransformers: (/** @type {any} */ program) => di.di({program})
                        }
                    }
                ]
            }
        ]
    },
    // Ensure webpack completely ignores the generated test extensions directory during resolution & watching.
    watchOptions: {
        ignored: ['**/out/.test-extensions/**']
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log', // enables logging required for problem matchers
    },
};

/** @type WebpackConfig */
const webExtensionConfig = {
    target: 'webworker',
    mode: 'none',
    entry: './src/web/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist/web'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode',
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@microsoft/vscode-fabric-api': path.resolve(__dirname, '../api/src/'),
            '@microsoft/vscode-fabric-util': path.resolve(__dirname, '../util/src/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: [/node_modules/, /out\/\.test-extensions/],
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            getCustomTransformers: (/** @type {any} */ program) => di.di({program})
                        }
                    }
                ]
            }
        ]
    },
    watchOptions: {
        ignored: ['**/out/.test-extensions/**']
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log',
    },
};

module.exports = [extensionConfig, webExtensionConfig];
