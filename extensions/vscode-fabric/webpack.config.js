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
            '@microsoft/vscode-fabric-api': path.resolve(__dirname, '../../packages/api/src/'),
            '@microsoft/vscode-fabric-util': path.resolve(__dirname, '../../packages/util/src/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
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
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log', // enables logging required for problem matchers
    },
};
module.exports = [extensionConfig];