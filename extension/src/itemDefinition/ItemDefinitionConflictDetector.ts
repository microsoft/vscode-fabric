// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { getItemDefinitionPathUri } from './pathUtils';

export interface IItemDefinitionConflictDetector {
    getConflictingFiles(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<string[]>;
}

// Content provider for showing diff content
class DiffContentProvider implements vscode.TextDocumentContentProvider {
    private contents = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) || '';
    }

    setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
    }
}

const diffProvider = new DiffContentProvider();
const DIFF_SCHEME = 'fabric-conflict-diff';

// Register the provider once
let providerRegistered = false;
function ensureProviderRegistered(): void {
    if (!providerRegistered) {
        vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, diffProvider);
        providerRegistered = true;
    }
}

/**
 * Normalizes a value for order-agnostic comparison with case-insensitive keys.
 * Recursively processes objects and arrays, converting keys (not values) to lowercase.
 */
function normalizeForComparison(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeForComparison);
    }
    if (value !== null && typeof value === 'object') {
        const normalized: Record<string, unknown> = {};
        // Sort keys for order-agnostic comparison
        const sortedKeys = Object.keys(value).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        for (const key of sortedKeys) {
            normalized[key.toLowerCase()] = normalizeForComparison((value as Record<string, unknown>)[key]);
        }
        return normalized;
    }
    return value;
}

/**
 * Compares two JSON strings with case-insensitive keys and order-agnostic comparison.
 * Returns true if they are equivalent, false otherwise.
 */
function areJsonContentsEquivalent(str1: string, str2: string): boolean {
    try {
        const obj1 = JSON.parse(str1);
        const obj2 = JSON.parse(str2);
        const normalized1 = normalizeForComparison(obj1);
        const normalized2 = normalizeForComparison(obj2);
        const normalizedStr1 = JSON.stringify(normalized1);
        const normalizedStr2 = JSON.stringify(normalized2);
        const isEquivalent = normalizedStr1 === normalizedStr2;
        if (!isEquivalent) {
            console.log('JSON diff details:');
            logJsonDifferences(normalized1, normalized2, '');
        }
        return isEquivalent;
    }
    catch {
        // If parsing fails, fall back to string comparison
        return false;
    }
}

/**
 * Recursively logs differences between two normalized JSON values.
 */
function logJsonDifferences(val1: unknown, val2: unknown, path: string): void {
    const currentPath = path || '(root)';

    if (val1 === val2) {
        return;
    }

    if (typeof val1 !== typeof val2) {
        console.log(`  ${currentPath}: type mismatch - existing is ${typeof val1}, remote is ${typeof val2}`);
        return;
    }

    if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) {
            console.log(`  ${currentPath}: array length mismatch - existing has ${val1.length} items, remote has ${val2.length} items`);
        }
        const maxLen = Math.max(val1.length, val2.length);
        for (let i = 0; i < maxLen; i++) {
            if (i >= val1.length) {
                console.log(`  ${currentPath}[${i}]: only in remote`);
            } else if (i >= val2.length) {
                console.log(`  ${currentPath}[${i}]: only in existing`);
            } else {
                logJsonDifferences(val1[i], val2[i], `${currentPath}[${i}]`);
            }
        }
        return;
    }

    if (val1 !== null && val2 !== null && typeof val1 === 'object' && typeof val2 === 'object' && !Array.isArray(val1) && !Array.isArray(val2)) {
        const obj1 = val1 as Record<string, unknown>;
        const obj2 = val2 as Record<string, unknown>;
        const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
        for (const key of allKeys) {
            const newPath = path ? `${path}.${key}` : key;
            if (!(key in obj1)) {
                console.log(`  ${newPath}: only in remote = ${JSON.stringify(obj2[key])}`);
            } else if (!(key in obj2)) {
                console.log(`  ${newPath}: only in existing = ${JSON.stringify(obj1[key])}`);
            } else {
                logJsonDifferences(obj1[key], obj2[key], newPath);
            }
        }
        return;
    }

    // Primitive value difference
    console.log(`  ${currentPath}: existing = ${JSON.stringify(val1)}, remote = ${JSON.stringify(val2)}`);
}

/**
 * Checks if a file path represents a JSON file.
 */
function isJsonFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.json');
}

export class ItemDefinitionConflictDetector {
    constructor(private readonly fileSystem: vscode.FileSystem) {}

    /**
     * Returns a list of file paths (relative to destination) that already exist and would be overwritten
     * with different content.
     */
    async getConflictingFiles(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<string[]> {
        const conflicts: string[] = [];
        if (!itemDefinition || !Array.isArray(itemDefinition.parts)) {
            return conflicts;
        }
        for (const part of itemDefinition.parts) {
            if (!part.path || part.payloadType !== PayloadType.InlineBase64) {
                continue;
            }

            let fileUri: vscode.Uri;
            try {
                fileUri = getItemDefinitionPathUri(part.path, destination);
            }
            catch {
                continue; // Skip unsafe paths
            }

            try {
                await this.fileSystem.stat(fileUri);
                // File exists, check content
                const existingContent = await this.fileSystem.readFile(fileUri);
                const partContent = Buffer.from(part.payload, 'base64');
                // Normalize line endings to LF for comparison
                const existingStr = Buffer.from(existingContent).toString('utf8').replace(/\r\n/g, '\n');
                const partStr = partContent.toString('utf8').replace(/\r\n/g, '\n');

                // Check if contents are equivalent
                let contentsMatch = existingStr === partStr;
                if (!contentsMatch && isJsonFile(part.path)) {
                    // For JSON files, also check case-insensitive and order-agnostic equivalence
                    contentsMatch = areJsonContentsEquivalent(existingStr, partStr);
                }

                if (!contentsMatch) {
                    // Log conflict details
                    console.log(`Conflict detected for ${part.path}:`);
                    console.log(`  existingContent length: ${existingStr.length}, partContent length: ${partStr.length}`);
                    console.log(`  existingContent (first 500 chars): ${existingStr.substring(0, 500)}`);
                    console.log(`  partContent (first 500 chars): ${partStr.substring(0, 500)}`);
                    // Find first differing position
                    const minLen = Math.min(existingStr.length, partStr.length);
                    for (let i = 0; i < minLen; i++) {
                        if (existingStr[i] !== partStr[i]) {
                            console.log(`  First difference at char ${i}: existing='${existingStr[i]}' (code: ${existingStr.charCodeAt(i)}), part='${partStr[i]}' (code: ${partStr.charCodeAt(i)})`);
                            console.log(`  Context around diff - existing: '${existingStr.substring(Math.max(0, i - 20), i + 20)}'`);
                            console.log(`  Context around diff - part: '${partStr.substring(Math.max(0, i - 20), i + 20)}'`);
                            break;
                        }
                    }
                    if (existingStr.length !== partStr.length) {
                        console.log(`  Length difference: existing=${existingStr.length}, part=${partStr.length}`);
                    }

                    // Show diff in VS Code diff editor
                    ensureProviderRegistered();
                    const timestamp = Date.now();
                    const localUri = vscode.Uri.parse(`${DIFF_SCHEME}:Local/${part.path}?t=${timestamp}`);
                    const remoteUri = vscode.Uri.parse(`${DIFF_SCHEME}:Remote/${part.path}?t=${timestamp}`);
                    diffProvider.setContent(localUri, existingStr);
                    diffProvider.setContent(remoteUri, partStr);
                    await vscode.commands.executeCommand('vscode.diff', localUri, remoteUri, `Conflict: ${part.path} (Local ↔ Remote)`);

                    conflicts.push(part.path);
                }
            }
            catch {
                // File does not exist or cannot be read, so no conflict
            }
        }
        return conflicts;
    }
}
