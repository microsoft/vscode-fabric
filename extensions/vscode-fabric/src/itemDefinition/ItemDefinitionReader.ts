import * as vscode from 'vscode';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';

export interface IBase64Encoder {
    encode(content: Uint8Array): string;
}

class Base64Encoder implements IBase64Encoder {
    public encode(content: Uint8Array): string {
        return Buffer.from(content).toString('base64');
    }
}

export interface IItemDefinitionReader {
    read(rootFolder: vscode.Uri): Promise<IItemDefinition>;
}

export class ItemDefinitionReader implements IItemDefinitionReader {
    public constructor(
        private readonly fileSystem: vscode.FileSystem,
        private readonly base64Encoder: IBase64Encoder = new Base64Encoder(),
    ) { 
    }

    async read(rootFolder: vscode.Uri): Promise<IItemDefinition> {
        const itemDefinition: IItemDefinition = { parts: [] };
        const allFiles: string[] = await this.getAllFilesRecursively(rootFolder);

        if (allFiles.length === 0) {
            return itemDefinition;
        }

        const fileReadPromises = allFiles.map(async (relativePath) => {
            // Construct the full file URI from the root and relative path
            const file = vscode.Uri.joinPath(rootFolder, ...relativePath.split('/'));
            const content = await this.fileSystem.readFile(file);
            const base64Content = this.base64Encoder.encode(content);

            return {
                path: relativePath,
                payload: base64Content,
                payloadType: PayloadType.InlineBase64
            };
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
