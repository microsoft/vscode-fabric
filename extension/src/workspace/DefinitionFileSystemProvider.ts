// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifactManager, IArtifact, IItemDefinition, IItemDefinitionPart, PayloadType } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, ILogger, TelemetryService, TelemetryActivity, doFabricAction } from '@microsoft/vscode-fabric-util';
import { IFabricFeatureConfiguration } from '../settings/FabricFeatureConfiguration';
import { IBase64Encoder } from '../itemDefinition/ItemDefinitionReader';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';

/**
 * A virtual file system provider for Fabric item definition files.
 * Allows viewing and editing definition files from remote artifacts.
 */
export class DefinitionFileSystemProvider implements vscode.FileSystemProvider {
    public static readonly scheme = 'fabric-definition';

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    // Cache for file contents: URI -> content
    private fileCache = new Map<string, Uint8Array>();

    // Cache for artifact metadata: URI -> artifact info
    private artifactCache = new Map<string, { artifact: IArtifact; fileName: string }>();

    constructor(
        private artifactManager: IArtifactManager,
        private featureConfiguration: IFabricFeatureConfiguration,
        private fabricEnvironmentProvider: IFabricEnvironmentProvider,
        private base64Encoder: IBase64Encoder,
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
        return vscode.Uri.parse(`${DefinitionFileSystemProvider.scheme}:///${artifact.workspaceId}/${artifact.id}/${fileName}`);
    }

    /**
     * Extracts and decodes a single file from an item definition.
     */
    private extractFileFromDefinition(definition: IItemDefinition, fileName: string): Uint8Array | undefined {
        const part = definition.parts.find(p => p.path === fileName);
        if (!part || !part.payload) {
            return undefined;
        }
        return this.base64Encoder.decode(part.payload);
    }

    /**
     * Fetches a definition file from the server and caches it.
     * Parses the URI to extract workspaceId, artifactId, and fileName.
     */
    private async fetchAndCacheFile(uri: vscode.Uri): Promise<void> {
        // URI format: fabric-definition:///<workspaceId>/<artifactId>/<fileName>
        const pathParts = uri.path.split('/').filter(p => p.length > 0);
        if (pathParts.length < 3) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const workspaceId = pathParts[0];
        const artifactId = pathParts[1];
        const fileName = pathParts.slice(2).join('/'); // Handle nested paths

        // Create a minimal artifact object for the API call
        const artifact: IArtifact = {
            id: artifactId,
            workspaceId: workspaceId,
            fabricEnvironment: this.fabricEnvironmentProvider.getCurrent().env,
            displayName: '', // Not needed for getArtifactDefinition
            type: '', // Not needed for getArtifactDefinition
        };

        try {
            // Fetch the definition from the server
            const response = await this.artifactManager.getArtifactDefinition(artifact);
            if (!response.parsedBody?.definition) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }

            const definition: IItemDefinition = response.parsedBody.definition;

            // Extract and decode the file
            const content = this.extractFileFromDefinition(definition, fileName);
            if (!content) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }

            // Cache it
            this.fileCache.set(uri.toString(), content);
            this.artifactCache.set(uri.toString(), { artifact, fileName });
        }
        catch (error: any) {
            this.logger.error(`Error fetching definition file: ${error.message}`);
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: readonly string[]; }): vscode.Disposable {
        // We don't need to watch for changes since we control all writes
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        const content = this.fileCache.get(uri.toString());
        if (!content) {
            // File not in cache - need to fetch it lazily
            return this.fetchAndCacheFile(uri).then(() => {
                const fetchedContent = this.fileCache.get(uri.toString());
                if (!fetchedContent) {
                    throw vscode.FileSystemError.FileNotFound(uri);
                }
                return {
                    type: vscode.FileType.File,
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: fetchedContent.length,
                };
            });
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

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        const content = this.fileCache.get(uri.toString());
        if (!content) {
            // File not in cache - fetch it lazily
            return this.fetchAndCacheFile(uri).then(() => {
                const fetchedContent = this.fileCache.get(uri.toString());
                if (!fetchedContent) {
                    throw vscode.FileSystemError.FileNotFound(uri);
                }
                return fetchedContent;
            });
        }
        return content;
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/definition/write', this.telemetryService);

        const artifactInfo = this.artifactCache.get(uri.toString());

        // Add initial telemetry properties if we have artifact info
        if (artifactInfo) {
            activity.addOrUpdateProperties({
                endpoint: this.fabricEnvironmentProvider.getCurrent().sharedUri,
                workspaceId: artifactInfo.artifact.workspaceId,
                artifactId: artifactInfo.artifact.id,
                fabricArtifactName: artifactInfo.artifact.displayName,
                itemType: artifactInfo.artifact.type,
                fileExtension: artifactInfo.fileName.split('.').pop() || '',
            });
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Saving {0}...', artifactInfo?.fileName ?? 'file'),
            cancellable: false,
        }, async () => {
            await doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
                try {
                    // Check if editing is enabled
                    if (!this.featureConfiguration.isEditItemDefinitionsEnabled()) {
                        const errorMessage = vscode.l10n.t('Editing definition files is disabled. Enable the "Fabric.EditItemDefinitions" setting to edit.');
                        throw vscode.FileSystemError.NoPermissions(errorMessage);
                    }

                    if (!artifactInfo) {
                        throw vscode.FileSystemError.FileNotFound(uri);
                    }

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
                    const base64Content = this.base64Encoder.encode(content);

                    // Update the part (using splice to avoid object injection warning)
                    const updatedPart: IItemDefinitionPart = {
                        path: artifactInfo.fileName,
                        payload: base64Content,
                        payloadType: PayloadType.InlineBase64,
                    };
                    definition.parts.splice(partIndex, 1, updatedPart);

                    // Save the updated definition back to the server
                    await this.artifactManager.updateArtifactDefinition(
                        artifactInfo.artifact,
                        definition,
                        vscode.Uri.file('') // folder parameter - not used for this scenario
                    );

                    // Fire change event
                    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);

                    activity.addOrUpdateProperties({ result: 'Succeeded' });

                    void vscode.window.showInformationMessage(
                        vscode.l10n.t('Successfully saved {0}', artifactInfo.fileName)
                    );
                }
                catch (error: any) {
                    activity.addOrUpdateProperties({ result: 'Failed' });
                    throw error;
                }
            });
        });
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Deleting files is not supported');
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Renaming files is not supported');
    }
}
