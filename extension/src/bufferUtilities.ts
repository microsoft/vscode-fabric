// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Cross-platform buffer utilities that work in both Node.js and web environments.
 * Use these instead of Node.js Buffer APIs for web compatibility.
 */

/**
 * Converts a Uint8Array to a base64-encoded string.
 * Web-compatible replacement for: `Buffer.from(content).toString('base64')`
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts a base64-encoded string to a Uint8Array.
 * Web-compatible replacement for: `Buffer.from(str, 'base64')`
 */
export function base64ToUint8Array(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Converts a UTF-8 string to a Uint8Array.
 * Web-compatible replacement for: `Buffer.from(str, 'utf-8')`
 */
export function stringToUint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

/**
 * Converts a Uint8Array to a UTF-8 string.
 * Web-compatible replacement for: `Buffer.from(bytes).toString('utf-8')`
 */
export function uint8ArrayToString(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

/**
 * Converts a base64-encoded string directly to a UTF-8 string.
 * Web-compatible replacement for: `Buffer.from(str, 'base64').toString('utf-8')`
 */
export function base64ToString(base64: string): string {
    return atob(base64);
}

/**
 * Converts a UTF-8 string directly to a base64-encoded string.
 * Web-compatible replacement for: `Buffer.from(str, 'utf-8').toString('base64')`
 */
export function stringToBase64(str: string): string {
    return btoa(str);
}

/**
 * Compares two Uint8Arrays for equality.
 * Web-compatible replacement for: `Buffer.from(a).equals(b)`
 */
export function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
