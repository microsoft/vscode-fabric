// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifactHandler, IArtifact } from '@microsoft/vscode-fabric-api';
import { FabricError } from '@microsoft/vscode-fabric-util';

/**
 * Artifact handler for SemanticModel artifacts handling large file exclusion.
 * On updateDefinition and createWithDefinition we exclude .abf files from the upload
 * to prevent "Cannot create a string longer than 0x1fffffe8 characters" errors.
 */
export class SemanticModelArtifactHandler implements IArtifactHandler {
    public readonly artifactType: string = 'SemanticModel';

    constructor(private readonly fileSystem: vscode.FileSystem = vscode.workspace.fs) {}

    public updateDefinitionWorkflow = {
        prepareForUpdateWithDefinition: async (
            artifact: IArtifact,
            folder: vscode.Uri
        ): Promise<string[] | undefined> => {
            return this.getFilteredFiles(folder);
        },
    };

    public createWithDefinitionWorkflow = {
        prepareForCreateWithDefinition: async (
            artifact: IArtifact,
            folder: vscode.Uri
        ): Promise<string[] | undefined> => {
            return this.getFilteredFiles(folder);
        },
    };

    /**
     * Gets all files in the folder recursively, excluding .abf files
     */
    private async getFilteredFiles(folder: vscode.Uri): Promise<string[]> {
        try {
            const files: string[] = [];
            await this.walkDirectory(folder, '', files);
            return files;
        }
        catch (error: any) {
            throw new FabricError(
                vscode.l10n.t('Error gathering files from {0} for semantic model definition: {1}', folder.fsPath, error.message ?? 'Unknown error'),
                'semantic-model-gather-files-failed',
                { showInUserNotification: 'Error' }
            );
        }
    }

    /**
     * Recursively walks through the directory and collects file paths
     */
    private async walkDirectory(directory: vscode.Uri, relativePathSoFar: string, files: string[]): Promise<void> {
        const entries = await this.fileSystem.readDirectory(directory);

        for (const [name, type] of entries) {
            const newRelativePath = relativePathSoFar ? `${relativePathSoFar}/${name}` : name;
            const fullPath = vscode.Uri.joinPath(directory, name);

            if (type === vscode.FileType.File) {
                // Exclude .platform (standard exclusion) and .abf files (semantic model specific)
                if (newRelativePath !== '.platform' && !newRelativePath.toLowerCase().endsWith('.abf')) {
                    files.push(newRelativePath);
                }
            }
            else if (type === vscode.FileType.Directory) {
                await this.walkDirectory(fullPath, newRelativePath, files);
            }
        }
    }
}
