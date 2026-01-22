// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { getItemDefinitionPathUri } from './pathUtils';

export interface IItemDefinitionConflictDetector {
    getConflictingFiles(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<string[]>;
}

const DEBUG_CONFLICT_DETECTOR = true;

/**
 * Deeply compares two values for equality, treating objects with the same properties
 * in different orders as equal. Property name comparison is case-insensitive.
 */
function deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        return false;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        return a.every((item, index) => deepEquals(item, b.at(index)));
    }
    // Use lowercase keys for case-insensitive comparison
    const aEntries = new Map(Object.entries(a as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v]));
    const bEntries = new Map(Object.entries(b as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v]));
    if (aEntries.size !== bEntries.size) {
        return false;
    }
    for (const [key, aValue] of aEntries) {
        if (!bEntries.has(key) || !deepEquals(aValue, bEntries.get(key))) {
            return false;
        }
    }
    return true;
}

interface JsonDifference {
    path: string;
    type: 'added' | 'removed' | 'changed' | 'type-mismatch';
    existingValue?: unknown;
    partValue?: unknown;
}

/**
 * Finds differences between two JSON values and returns a list of paths that differ.
 */
function findJsonDifferences(existing: unknown, part: unknown, path: string = ''): JsonDifference[] {
    const differences: JsonDifference[] = [];

    if (existing === part) {
        return differences;
    }

    const existingType = existing === null ? 'null' : Array.isArray(existing) ? 'array' : typeof existing;
    const partType = part === null ? 'null' : Array.isArray(part) ? 'array' : typeof part;

    if (existingType !== partType) {
        differences.push({ path: path || '(root)', type: 'type-mismatch', existingValue: `[${existingType}]`, partValue: `[${partType}]` });
        return differences;
    }

    if (existingType !== 'object' && existingType !== 'array') {
        // Primitive value difference
        differences.push({ path: path || '(root)', type: 'changed', existingValue: existing, partValue: part });
        return differences;
    }

    if (Array.isArray(existing) && Array.isArray(part)) {
        const maxLen = Math.max(existing.length, part.length);
        for (let i = 0; i < maxLen; i++) {
            const itemPath = `${path}[${i}]`;
            if (i >= existing.length) {
                differences.push({ path: itemPath, type: 'added', partValue: part.at(i) });
            }
            else if (i >= part.length) {
                differences.push({ path: itemPath, type: 'removed', existingValue: existing.at(i) });
            }
            else {
                differences.push(...findJsonDifferences(existing.at(i), part.at(i), itemPath));
            }
        }
        return differences;
    }

    // Both are objects - use lowercase keys for case-insensitive comparison
    const existingObj = existing as Record<string, unknown>;
    const partObj = part as Record<string, unknown>;

    const existingEntries = new Map(Object.entries(existingObj).map(([k, v]) => [k.toLowerCase(), v]));
    const partEntries = new Map(Object.entries(partObj).map(([k, v]) => [k.toLowerCase(), v]));
    const allKeys = new Set([...existingEntries.keys(), ...partEntries.keys()]);

    for (const key of allKeys) {
        const keyPath = path ? `${path}.${key}` : key;
        const hasExisting = existingEntries.has(key);
        const hasPart = partEntries.has(key);

        if (!hasExisting) {
            differences.push({ path: keyPath, type: 'added', partValue: partEntries.get(key) });
        }
        else if (!hasPart) {
            differences.push({ path: keyPath, type: 'removed', existingValue: existingEntries.get(key) });
        }
        else {
            differences.push(...findJsonDifferences(existingEntries.get(key), partEntries.get(key), keyPath));
        }
    }

    return differences;
}

/**
 * Formats a value for display in logs.
 */
function formatValue(value: unknown): string {
    if (typeof value === 'string') {
        return value.length > 50 ? `"${value.slice(0, 50)}..."` : `"${value}"`;
    }
    if (typeof value === 'object') {
        const str = JSON.stringify(value);
        return str.length > 50 ? `${str.slice(0, 50)}...` : str;
    }
    return String(value);
}

/**
 * Compares two buffers for content equality.
 * For JSON files, compares parsed objects (order-agnostic).
 * For other files, compares normalized strings (whitespace-agnostic).
 */
function areContentsEqual(existingBuffer: Buffer, partBuffer: Buffer, filePath: string): boolean {
    const existingStr = existingBuffer.toString('utf8');
    const partStr = partBuffer.toString('utf8');

    // Try JSON comparison for .json files
    if (filePath.endsWith('.json')) {
        try {
            const existingJson = JSON.parse(existingStr);
            const partJson = JSON.parse(partStr);
            return deepEquals(existingJson, partJson);
        }
        catch {
            // Fall through to string comparison if JSON parsing fails
        }
    }

    // Fallback: compare with whitespace normalized
    return existingStr.replace(/\s+/g, '') === partStr.replace(/\s+/g, '');
}

export class ItemDefinitionConflictDetector {
    constructor(private readonly fileSystem: vscode.FileSystem) { }

    /**
     * Returns a list of file paths (relative to destination) that already exist and would be overwritten
     * with different content (ignoring whitespace differences).
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
                const existingBuffer = Buffer.from(existingContent);

                // Compare content (JSON files are compared order-agnostically)
                if (!areContentsEqual(existingBuffer, partContent, part.path)) {
                    if (DEBUG_CONFLICT_DETECTOR) {
                        console.log(`[ConflictDetector] Conflict detected for: ${part.path}`);
                        console.log(`  Existing length: ${existingBuffer.length}, Part length: ${partContent.length}`);

                        // For JSON files, show which members differ
                        if (part.path.endsWith('.json')) {
                            try {
                                const existingJson = JSON.parse(existingBuffer.toString('utf8'));
                                const partJson = JSON.parse(partContent.toString('utf8'));
                                const differences = findJsonDifferences(existingJson, partJson);
                                console.log(`  JSON differences (${differences.length}):`);
                                for (const diff of differences.slice(0, 20)) { // Limit to first 20
                                    switch (diff.type) {
                                        case 'added':
                                            console.log(`    + ${diff.path}: ${formatValue(diff.partValue)}`);
                                            break;
                                        case 'removed':
                                            console.log(`    - ${diff.path}: ${formatValue(diff.existingValue)}`);
                                            break;
                                        case 'changed':
                                            console.log(`    ~ ${diff.path}: ${formatValue(diff.existingValue)} → ${formatValue(diff.partValue)}`);
                                            break;
                                        case 'type-mismatch':
                                            console.log(`    ! ${diff.path}: type ${diff.existingValue} → ${diff.partValue}`);
                                            break;
                                    }
                                }
                                if (differences.length > 20) {
                                    console.log(`    ... and ${differences.length - 20} more differences`);
                                }
                            }
                            catch {
                                // Fall back to hex dump if JSON parsing fails
                                const toSpacedHex = (buf: Buffer) => [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ');
                                console.log(`  Existing first 50 bytes (hex): ${toSpacedHex(existingBuffer.slice(0, 50))}`);
                                console.log(`  Part first 50 bytes (hex): ${toSpacedHex(partContent.slice(0, 50))}`);
                            }
                        }
                        else {
                            const toSpacedHex = (buf: Buffer) => [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ');
                            console.log(`  Existing first 50 bytes (hex): ${toSpacedHex(existingBuffer.slice(0, 50))}`);
                            console.log(`  Part first 50 bytes (hex): ${toSpacedHex(partContent.slice(0, 50))}`);
                            console.log(`  Existing last 20 bytes (hex): ${toSpacedHex(existingBuffer.slice(-20))}`);
                            console.log(`  Part last 20 bytes (hex): ${toSpacedHex(partContent.slice(-20))}`);
                        }

                        // Open VS Code diff view for visual comparison
                        const existingDoc = await vscode.workspace.openTextDocument({ content: existingBuffer.toString('utf8'), language: 'json' });
                        const partDoc = await vscode.workspace.openTextDocument({ content: partContent.toString('utf8'), language: 'json' });
                        await vscode.commands.executeCommand('vscode.diff', existingDoc.uri, partDoc.uri, `Conflict: ${part.path} (Local ↔ Remote)`);
                    }

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
