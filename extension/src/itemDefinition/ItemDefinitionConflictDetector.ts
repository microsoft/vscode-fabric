// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { getItemDefinitionPathUri } from './pathUtils';

export interface IItemDefinitionConflictDetector {
    getConflictingFiles(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<string[]>;
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
                if (!Buffer.from(existingContent).equals(partContent)) {
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
