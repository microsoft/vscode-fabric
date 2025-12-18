// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifactManager, IArtifact, IItemDefinition, IItemDefinitionPart, PayloadType } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

/**
 * A virtual file system provider for Fabric item definition files.
 * Allows viewing and editing definition files from remote artifacts.
 */
export class DefinitionFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    // Cache for file contents: URI -> content
    private fileCache = new Map<string, Uint8Array>();
    
    // Cache for artifact metadata: URI -> artifact info
    private artifactCache = new Map<string, { artifact: IArtifact; fileName: string }>();

    constructor(
        private artifactManager: IArtifactManager,
        private logger: ILogger,
        private telemetryService: TelemetryService | null
    ) {}

    /**
     * Registers a file in the virtual file system
     * @param artifact The artifact this file belongs to
     * @param fileName The name/path of the file
     * @param content The file content
     * @returns The URI for the virtual file
     */
    registerFile(artifact: IArtifact, fileName: string, content: Uint8Array): vscode.Uri {
        const uri = this.createUri(artifact, fileName);
        this.fileCache.set(uri.toString(), content);
        this.artifactCache.set(uri.toString(), { artifact, fileName });
        return uri;
    }

    /**
     * Creates a URI for a definition file
     */
    private createUri(artifact: IArtifact, fileName: string): vscode.Uri {
        // Format: fabric-definition:///<workspaceId>/<artifactId>/<fileName>
        return vscode.Uri.parse(`fabric-definition:///${artifact.workspaceId}/${artifact.id}/${fileName}`);
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: readonly string[]; }): vscode.Disposable {
        // We don't need to watch for changes since we control all writes
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const content = this.fileCache.get(uri.toString());
        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.length,
        };
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        throw vscode.FileSystemError.NoPermissions('Reading directories is not supported');
    }

    createDirectory(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions('Creating directories is not supported');
    }

    readFile(uri: vscode.Uri): Uint8Array {
        const content = this.fileCache.get(uri.toString());
        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return content;
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
        const artifactInfo = this.artifactCache.get(uri.toString());
        if (!artifactInfo) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        try {
            // Update the cache
            this.fileCache.set(uri.toString(), content);

            // Get the current definition
            const response = await this.artifactManager.getArtifactDefinition(artifactInfo.artifact);
            if (!response.parsedBody?.definition) {
                throw new Error('Failed to get current artifact definition');
            }

            const definition: IItemDefinition = response.parsedBody.definition;

            // Find and update the part
            const partIndex = definition.parts.findIndex(p => p.path === artifactInfo.fileName);
            if (partIndex === -1) {
                throw new Error(`File ${artifactInfo.fileName} not found in definition`);
            }

            // Encode the new content as base64
            const base64Content = Buffer.from(content).toString('base64');

            // Update the part (using splice to avoid object injection warning)
            const updatedPart: IItemDefinitionPart = {
                path: artifactInfo.fileName,
                payload: base64Content,
                payloadType: PayloadType.InlineBase64,
            };
            definition.parts.splice(partIndex, 1, updatedPart);

            // Save the updated definition back to the server
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Saving {0}...', artifactInfo.fileName),
                cancellable: false,
            }, async (progress) => {
                await this.artifactManager.updateArtifactDefinition(
                    artifactInfo.artifact,
                    definition,
                    vscode.Uri.file('') // folder parameter - not used for this scenario
                );
            });

            // Fire change event
            this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);

            this.telemetryService?.sendTelemetryEvent('definition-file/saved', {
                artifactType: artifactInfo.artifact.type,
                fileName: artifactInfo.fileName,
            });

            void vscode.window.showInformationMessage(
                vscode.l10n.t('Successfully saved {0}', artifactInfo.fileName)
            );
        }
        catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error saving definition file: ${errorMessage}`);
            
            this.telemetryService?.sendTelemetryErrorEvent(error, {
                errorEventName: 'definition-file/save-error',
                fault: errorMessage,
            });

            void vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to save {0}: {1}', artifactInfo.fileName, errorMessage)
            );
            
            throw vscode.FileSystemError.Unavailable(errorMessage);
        }
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Deleting files is not supported');
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Renaming files is not supported');
    }
}
