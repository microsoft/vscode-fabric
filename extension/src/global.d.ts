// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Compile-time constant injected by webpack DefinePlugin.
 * - `true` when building for web (webworker target)
 * - `false` when building for desktop (node target)
 *
 * Use for conditional code that should be tree-shaken at build time:
 * ```typescript
 * if (!__IS_WEB__) {
 *     // Desktop-only code - excluded from web bundle
 * }
 * ```
 */
declare const __IS_WEB__: boolean;
