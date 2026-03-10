// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { uint8ArrayToBase64, base64ToUint8Array } from '../bufferUtilities';

export interface IBase64Encoder {
    encode(content: Uint8Array): string;
    decode(base64String: string): Uint8Array;
}

export class Base64Encoder implements IBase64Encoder {
    public encode(content: Uint8Array): string {
        return uint8ArrayToBase64(content);
    }
    public decode(base64String: string): Uint8Array {
        return base64ToUint8Array(base64String);
    }
}

export interface IItemDefinitionReader {
    read(rootFolder: vscode.Uri, files?: string[]): Promise<IItemDefinition>;
}

export class ItemDefinitionReader implements IItemDefinitionReader {
    public constructor(
        private readonly fileSystem: vscode.FileSystem,
        private readonly base64Encoder: IBase64Encoder = new Base64Encoder()
    ) {}

    async read(rootFolder: vscode.Uri, files?: string[]): Promise<IItemDefinition> {
        let filePaths: string[];
        if (files && files.length > 0) {
            filePaths = files;
        }
        else {
            filePaths = await this.getAllFilesRecursively(rootFolder);
        }

        const itemDefinition: IItemDefinition = { parts: [] };

        if (filePaths.length === 0) {
            return itemDefinition;
        }

        const fileReadPromises = filePaths.map(async (relativePath) => {
            try {
                // Normalize all paths to use '/' as separator
                relativePath = relativePath.replace(/\\/g, '/');
                const segments = relativePath.split('/');

                // Avoid directory traversal: ensure none of the segments are '..'
                if (segments.some(segment => segment === '..')) {
                    throw new Error(`Invalid file path: directory traversal is not allowed (${relativePath})`);
                }
                const file = vscode.Uri.joinPath(rootFolder, ...segments);
                const content = await this.fileSystem.readFile(file);
                const base64Content = this.base64Encoder.encode(content);

                return {
                    path: relativePath,
                    payload: base64Content,
                    payloadType: PayloadType.InlineBase64,
                };
            }
            catch (error: any) {
                // Provide better error message that includes the specific file being processed
                const errorMessage = error.message ?? 'Unknown error';
                throw new Error(`Error processing file '${relativePath}': ${errorMessage}`);
            }
        });

        itemDefinition.parts = await Promise.all(fileReadPromises);
        return itemDefinition;
    }

    private async getAllFilesRecursively(directory: vscode.Uri): Promise<string[]> {
        // Start recursion with empty relative path
        return this.walkDirectory(directory, '');
    }

    private async walkDirectory(directory: vscode.Uri, relativePathSoFar: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await this.fileSystem.readDirectory(directory);

        for (const [name, type] of entries) {
            // Always use '/' as separator
            const newRelativePath = relativePathSoFar ? `${relativePathSoFar}/${name}` : name;
            const fullPath = vscode.Uri.joinPath(directory, name);

            if (type === vscode.FileType.File && newRelativePath !== '.platform') {
                files.push(newRelativePath);
            }
            else if (type === vscode.FileType.Directory) {
                const subFiles = await this.walkDirectory(fullPath, newRelativePath);
                files.push(...subFiles);
            }
        }
        return files;
    }
}
