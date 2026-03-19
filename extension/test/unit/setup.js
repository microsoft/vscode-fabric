// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Mocha test setup file - runs before any tests are loaded.
 * Defines global variables that are normally injected by webpack.
 */

// Define __IS_WEB__ global that is normally injected by webpack's DefinePlugin
// This must be defined before any test files are loaded
globalThis.__IS_WEB__ = false;

