// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import {
    uint8ArrayToBase64,
    base64ToUint8Array,
    stringToUint8Array,
    uint8ArrayToString,
    base64ToString,
    stringToBase64,
    uint8ArraysEqual,
} from '../../../src/bufferUtilities';

describe('bufferUtilities', () => {
    describe('uint8ArrayToBase64', () => {
        it('should convert empty array to empty string', () => {
            const result = uint8ArrayToBase64(new Uint8Array([]));
            assert.strictEqual(result, '');
        });

        it('should convert bytes to base64', () => {
            const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            const result = uint8ArrayToBase64(bytes);
            assert.strictEqual(result, 'SGVsbG8=');
        });

        it('should handle binary data with non-printable characters', () => {
            const bytes = new Uint8Array([0, 1, 255, 128, 64]);
            const result = uint8ArrayToBase64(bytes);
            assert.strictEqual(result, 'AAH/gEA=');
        });

        it('should handle large payloads without call stack overflow (regression: >65KB files)', () => {
            // Simulates a ~270KB binary file (e.g., a PNG image).
            // The original spread-based implementation would throw
            // "Maximum call stack size exceeded" at this size.
            const size = 270_000;
            const bytes = new Uint8Array(size);
            for (let i = 0; i < size; i++) {
                bytes[i] = i % 256;
            }

            // Should not throw
            const base64 = uint8ArrayToBase64(bytes);

            // Verify roundtrip integrity
            const decoded = base64ToUint8Array(base64);
            assert.strictEqual(decoded.length, size);
            assert.deepStrictEqual(Array.from(decoded.slice(0, 5)), [0, 1, 2, 3, 4]);
            assert.deepStrictEqual(
                Array.from(decoded.slice(size - 3)),
                [(size - 3) % 256, (size - 2) % 256, (size - 1) % 256]
            );
        });
    });

    describe('base64ToUint8Array', () => {
        it('should convert empty string to empty array', () => {
            const result = base64ToUint8Array('');
            assert.strictEqual(result.length, 0);
        });

        it('should convert base64 to bytes', () => {
            const result = base64ToUint8Array('SGVsbG8=');
            assert.deepStrictEqual(Array.from(result), [72, 101, 108, 108, 111]); // "Hello"
        });

        it('should handle binary data with non-printable characters', () => {
            const result = base64ToUint8Array('AAH/gEA=');
            assert.deepStrictEqual(Array.from(result), [0, 1, 255, 128, 64]);
        });
    });

    describe('uint8ArrayToBase64 and base64ToUint8Array roundtrip', () => {
        it('should roundtrip correctly', () => {
            const original = new Uint8Array([1, 2, 3, 100, 200, 255, 0]);
            const base64 = uint8ArrayToBase64(original);
            const result = base64ToUint8Array(base64);
            assert.deepStrictEqual(Array.from(result), Array.from(original));
        });
    });

    describe('stringToUint8Array', () => {
        it('should convert empty string to empty array', () => {
            const result = stringToUint8Array('');
            assert.strictEqual(result.length, 0);
        });

        it('should convert ASCII string to bytes', () => {
            const result = stringToUint8Array('Hello');
            assert.deepStrictEqual(Array.from(result), [72, 101, 108, 108, 111]);
        });

        it('should convert UTF-8 string with multibyte characters', () => {
            const result = stringToUint8Array('こんにちは'); // Japanese "Hello"
            // UTF-8 encoding of these characters
            assert.strictEqual(result.length, 15); // 5 characters × 3 bytes each
        });
    });

    describe('uint8ArrayToString', () => {
        it('should convert empty array to empty string', () => {
            const result = uint8ArrayToString(new Uint8Array([]));
            assert.strictEqual(result, '');
        });

        it('should convert bytes to ASCII string', () => {
            const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            const result = uint8ArrayToString(bytes);
            assert.strictEqual(result, 'Hello');
        });

        it('should convert UTF-8 bytes to string', () => {
            // UTF-8 encoding of "こんにちは"
            const bytes = stringToUint8Array('こんにちは');
            const result = uint8ArrayToString(bytes);
            assert.strictEqual(result, 'こんにちは');
        });
    });

    describe('stringToUint8Array and uint8ArrayToString roundtrip', () => {
        it('should roundtrip ASCII correctly', () => {
            const original = 'Hello, World!';
            const bytes = stringToUint8Array(original);
            const result = uint8ArrayToString(bytes);
            assert.strictEqual(result, original);
        });

        it('should roundtrip UTF-8 correctly', () => {
            const original = 'Hello 世界 🌍';
            const bytes = stringToUint8Array(original);
            const result = uint8ArrayToString(bytes);
            assert.strictEqual(result, original);
        });
    });

    describe('base64ToString', () => {
        it('should convert empty base64 to empty string', () => {
            const result = base64ToString('');
            assert.strictEqual(result, '');
        });

        it('should decode base64 to string', () => {
            const result = base64ToString('SGVsbG8=');
            assert.strictEqual(result, 'Hello');
        });
    });

    describe('stringToBase64', () => {
        it('should convert empty string to empty base64', () => {
            const result = stringToBase64('');
            assert.strictEqual(result, '');
        });

        it('should encode string to base64', () => {
            const result = stringToBase64('Hello');
            assert.strictEqual(result, 'SGVsbG8=');
        });
    });

    describe('stringToBase64 and base64ToString roundtrip', () => {
        it('should roundtrip correctly', () => {
            const original = 'Hello, World!';
            const base64 = stringToBase64(original);
            const result = base64ToString(base64);
            assert.strictEqual(result, original);
        });
    });

    describe('uint8ArraysEqual', () => {
        it('should return true for two empty arrays', () => {
            const a = new Uint8Array([]);
            const b = new Uint8Array([]);
            assert.strictEqual(uint8ArraysEqual(a, b), true);
        });

        it('should return true for identical arrays', () => {
            const a = new Uint8Array([1, 2, 3, 4, 5]);
            const b = new Uint8Array([1, 2, 3, 4, 5]);
            assert.strictEqual(uint8ArraysEqual(a, b), true);
        });

        it('should return false for arrays with different lengths', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2, 3, 4]);
            assert.strictEqual(uint8ArraysEqual(a, b), false);
        });

        it('should return false for arrays with different values', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2, 4]);
            assert.strictEqual(uint8ArraysEqual(a, b), false);
        });

        it('should return false when first element differs', () => {
            const a = new Uint8Array([0, 2, 3]);
            const b = new Uint8Array([1, 2, 3]);
            assert.strictEqual(uint8ArraysEqual(a, b), false);
        });

        it('should return false when last element differs', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2, 0]);
            assert.strictEqual(uint8ArraysEqual(a, b), false);
        });

        it('should return true for the same reference', () => {
            const a = new Uint8Array([1, 2, 3]);
            assert.strictEqual(uint8ArraysEqual(a, a), true);
        });
    });
});
