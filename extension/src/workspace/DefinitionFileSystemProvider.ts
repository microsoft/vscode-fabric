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
 * Allows viewing, editing, creating, and deleting definition files from remote artifacts.
 * Supports both individual file operations and full directory-level access.
 */
export class DefinitionFileSystemProvider implements vscode.FileSystemProvider {
    public static readonly scheme = 'fabric-definition';

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    // Cache for file contents: URI string -> content
    private fileCache = new Map<string, Uint8Array>();

    // Cache for artifact metadata: URI string -> artifact info
    private artifactCache = new Map<string, { artifact: IArtifact; fileName: string }>();

    // Cache for full item definitions: "workspaceId/artifactId" -> definition + metadata
    private itemDefinitionCache = new Map<string, { artifact: IArtifact; definition: IItemDefinition; cachedAt: number }>();

    // Deduplication for in-flight fetch requests
    private pendingFetches = new Map<string, Promise<void>>();

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
     * Registers a full item definition in the cache, making all its files
     * accessible for directory listing and individual file operations.
     * @param artifact The artifact that owns this definition
     * @param definition The full item definition with all parts
     */
    registerItem(artifact: IArtifact, definition: IItemDefinition): void {
        const cacheKey = this.getItemCacheKey(artifact.workspaceId, artifact.id);
        this.itemDefinitionCache.set(cacheKey, {
            artifact,
            definition,
            cachedAt: Date.now(),
        });

        // Also register each individual file for direct access
        for (const part of definition.parts) {
            if (!part.path || !part.payload) {
                continue;
            }
            const content = this.base64Encoder.decode(part.payload);
            this.registerFile(artifact, part.path, content);
        }
    }

    /**
     * Returns the cached item definition for a given workspace/artifact, or undefined if not cached.
     */
    getCachedItemDefinition(workspaceId: string, artifactId: string): { artifact: IArtifact; definition: IItemDefinition; cachedAt: number } | undefined {
        return this.itemDefinitionCache.get(this.getItemCacheKey(workspaceId, artifactId));
    }

    /**
     * Creates a cache key for the item definition cache
     */
    private getItemCacheKey(workspaceId: string, artifactId: string): string {
        return `${workspaceId}/${artifactId}`;
    }

    /**
     * Creates a URI for a definition file
     */
    private createUri(artifact: IArtifact, fileName: string): vscode.Uri {
        // Format: fabric-definition:///<workspaceId>/<artifactId>/<fileName>
        return vscode.Uri.parse(`${DefinitionFileSystemProvider.scheme}:///${artifact.workspaceId}/${artifact.id}/${fileName}`);
    }

    /**
     * Parses a URI into workspaceId, artifactId, and filePath components.
     * Returns undefined if the URI doesn't have enough path segments.
     */
    private parseUri(uri: vscode.Uri): { workspaceId: string; artifactId: string; filePath: string } | undefined {
        const pathParts = uri.path.split('/').filter(p => p.length > 0);
        if (pathParts.length < 2) {
            return undefined;
        }
        return {
            workspaceId: pathParts[0],
            artifactId: pathParts[1],
            filePath: pathParts.slice(2).join('/'),
        };
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
     * Deduplicates concurrent requests for the same artifact.
     */
    private async fetchAndCacheFile(uri: vscode.Uri): Promise<void> {
        const parsed = this.parseUri(uri);
        if (!parsed || parsed.filePath === '') {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const { workspaceId, artifactId, filePath } = parsed;
        const fetchKey = this.getItemCacheKey(workspaceId, artifactId);

        // If a fetch for this artifact is already in progress, wait for it
        const existingFetch = this.pendingFetches.get(fetchKey);
        if (existingFetch) {
            await existingFetch;
            // After the shared fetch completes, check if our file is now cached
            if (this.fileCache.has(uri.toString())) {
                return;
            }
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        // Create a new fetch promise and store it for deduplication
        const fetchPromise = this.doFetchAndCache(workspaceId, artifactId, filePath, uri);
        this.pendingFetches.set(fetchKey, fetchPromise);

        try {
            await fetchPromise;
        }
        finally {
            this.pendingFetches.delete(fetchKey);
        }
    }

    /**
     * Internal fetch implementation that retrieves the full definition
     * and caches all parts for the artifact.
     */
    private async doFetchAndCache(workspaceId: string, artifactId: string, filePath: string, uri: vscode.Uri): Promise<void> {
        // Check if we already have the item definition cached
        const cached = this.getCachedItemDefinition(workspaceId, artifactId);
        if (cached) {
            const content = this.extractFileFromDefinition(cached.definition, filePath);
            if (content) {
                this.fileCache.set(uri.toString(), content);
                this.artifactCache.set(uri.toString(), { artifact: cached.artifact, fileName: filePath });
                return;
            }
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        // Create a minimal artifact object for the API call
        const artifact: IArtifact = {
            id: artifactId,
            workspaceId: workspaceId,
            fabricEnvironment: this.fabricEnvironmentProvider.getCurrent().env,
            displayName: '',
            type: '',
        };

        try {
            const response = await this.artifactManager.getArtifactDefinition(artifact);
            if (!response.parsedBody?.definition) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }

            const definition: IItemDefinition = response.parsedBody.definition;

            // Cache the full item definition
            this.registerItem(artifact, definition);

            // Check if the specific file we wanted is now cached
            if (!this.fileCache.has(uri.toString())) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
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
        // Check if it's a file first
        const content = this.fileCache.get(uri.toString());
        if (content) {
            return {
                type: vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: content.length,
            };
        }

        // Check if it's a directory (item root or subfolder)
        const parsed = this.parseUri(uri);
        if (parsed) {
            const { workspaceId, artifactId, filePath } = parsed;
            const cached = this.getCachedItemDefinition(workspaceId, artifactId);
            if (cached) {
                // Item root (empty filePath) is always a directory
                if (filePath === '') {
                    return {
                        type: vscode.FileType.Directory,
                        ctime: Date.now(),
                        mtime: Date.now(),
                        size: 0,
                    };
                }

                // Check if any part starts with this path as a directory prefix
                const dirPrefix = filePath + '/';
                const isDir = cached.definition.parts.some(p => p.path.startsWith(dirPrefix));
                if (isDir) {
                    return {
                        type: vscode.FileType.Directory,
                        ctime: Date.now(),
                        mtime: Date.now(),
                        size: 0,
                    };
                }
            }
        }

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

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        const parsed = this.parseUri(uri);
        if (!parsed) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const { workspaceId, artifactId, filePath } = parsed;
        const cached = this.getCachedItemDefinition(workspaceId, artifactId);
        if (!cached) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const dirPrefix = filePath === '' ? '' : filePath + '/';
        const entries = new Map<string, vscode.FileType>();

        for (const part of cached.definition.parts) {
            if (!part.path) {
                continue;
            }

            // For root listing, process all parts; for subdirectories, only matching prefix
            if (dirPrefix !== '' && !part.path.startsWith(dirPrefix)) {
                continue;
            }

            // Get the relative path from this directory
            const relativePath = dirPrefix === '' ? part.path : part.path.substring(dirPrefix.length);
            const firstSegment = relativePath.split('/')[0];

            if (relativePath.includes('/')) {
                // This is a subdirectory entry
                entries.set(firstSegment, vscode.FileType.Directory);
            }
            else {
                // This is a direct file entry
                entries.set(firstSegment, vscode.FileType.File);
            }
        }

        return Array.from(entries.entries());
    }

    createDirectory(uri: vscode.Uri): void {
        // Validate the URI refers to a known item
        const parsed = this.parseUri(uri);
        if (!parsed || parsed.filePath === '') {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const { workspaceId, artifactId, filePath } = parsed;
        const cached = this.getCachedItemDefinition(workspaceId, artifactId);
        if (!cached) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        // Check if this directory already exists (has files under it)
        const dirPrefix = filePath + '/';
        const hasExistingFiles = cached.definition.parts.some(p => p.path.startsWith(dirPrefix));
        if (hasExistingFiles) {
            throw vscode.FileSystemError.FileExists(uri);
        }

        // No-op - directories are implicit in the definition parts.
        // The directory will become real when a file is created under it.
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

        const parsed = this.parseUri(uri);
        if (!parsed || parsed.filePath === '') {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const { workspaceId, artifactId, filePath } = parsed;
        const isExistingFile = this.fileCache.has(uri.toString());

        // Validate create/overwrite flags per VS Code FileSystemProvider contract
        if (isExistingFile && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }
        if (!isExistingFile && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        // Resolve the artifact; from file cache for existing files, from item cache for new files
        const artifactInfo = this.artifactCache.get(uri.toString());
        let artifact: IArtifact;
        if (artifactInfo) {
            artifact = artifactInfo.artifact;
        }
        else {
            const cached = this.getCachedItemDefinition(workspaceId, artifactId);
            if (!cached) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
            artifact = cached.artifact;
        }

        const fileName = artifactInfo?.fileName ?? filePath;

        // Add initial telemetry properties
        activity.addOrUpdateProperties({
            endpoint: this.fabricEnvironmentProvider.getCurrent().sharedUri,
            workspaceId: artifact.workspaceId,
            artifactId: artifact.id,
            fabricArtifactName: artifact.displayName,
            itemType: artifact.type,
            fileExtension: fileName.split('.').pop() || '',
        });

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Saving {0}...', fileName),
            cancellable: false,
        }, async () => {
            await doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
                try {
                    // Check if editing is enabled
                    if (!this.featureConfiguration.isEditItemDefinitionsEnabled()) {
                        const errorMessage = vscode.l10n.t('Editing definition files is disabled. Enable the "Fabric.EditItemDefinitions" setting to edit.');
                        throw vscode.FileSystemError.NoPermissions(errorMessage);
                    }

                    // Resolve the current definition - prefer local cache over server fetch
                    let definition: IItemDefinition;
                    const cached = this.getCachedItemDefinition(workspaceId, artifactId);
                    if (cached) {
                        definition = cached.definition;
                    }
                    else {
                        const response = await this.artifactManager.getArtifactDefinition(artifact);
                        if (!response.parsedBody?.definition) {
                            throw new Error('Failed to get current artifact definition');
                        }
                        definition = response.parsedBody.definition;
                    }

                    // Encode the new content as base64
                    const base64Content = this.base64Encoder.encode(content);

                    const updatedPart: IItemDefinitionPart = {
                        path: filePath,
                        payload: base64Content,
                        payloadType: PayloadType.InlineBase64,
                    };

                    // Update existing part or add new one
                    const partIndex = definition.parts.findIndex(p => p.path === filePath);
                    if (partIndex !== -1) {
                        definition.parts.splice(partIndex, 1, updatedPart);
                    }
                    else {
                        definition.parts.push(updatedPart);
                    }

                    // Update all local caches
                    this.fileCache.set(uri.toString(), content);
                    if (!artifactInfo) {
                        this.artifactCache.set(uri.toString(), { artifact, fileName: filePath });
                    }
                    this.itemDefinitionCache.set(this.getItemCacheKey(workspaceId, artifactId), {
                        artifact,
                        definition,
                        cachedAt: Date.now(),
                    });

                    // Save the updated definition back to the server
                    await this.artifactManager.updateArtifactDefinition(
                        artifact,
                        definition,
                        vscode.Uri.file('') // folder parameter - not used for this scenario
                    );

                    // Fire change event
                    const changeType = isExistingFile ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created;
                    this._emitter.fire([{ type: changeType, uri }]);

                    activity.addOrUpdateProperties({ result: 'Succeeded' });

                    void vscode.window.showInformationMessage(
                        vscode.l10n.t('Successfully saved {0}', fileName)
                    );
                }
                catch (error: any) {
                    activity.addOrUpdateProperties({ result: 'Failed' });
                    throw error;
                }
            });
        });
    }

    async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/definition/delete', this.telemetryService);

        const parsed = this.parseUri(uri);
        if (!parsed || parsed.filePath === '') {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const { workspaceId, artifactId, filePath } = parsed;

        // Resolve the artifact from caches
        const artifactInfo = this.artifactCache.get(uri.toString());
        let artifact: IArtifact;
        if (artifactInfo) {
            artifact = artifactInfo.artifact;
        }
        else {
            const cached = this.getCachedItemDefinition(workspaceId, artifactId);
            if (!cached) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
            artifact = cached.artifact;
        }

        activity.addOrUpdateProperties({
            endpoint: this.fabricEnvironmentProvider.getCurrent().sharedUri,
            workspaceId: artifact.workspaceId,
            artifactId: artifact.id,
            fabricArtifactName: artifact.displayName,
            itemType: artifact.type,
        });

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Deleting {0}...', filePath),
            cancellable: false,
        }, async () => {
            await doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
                try {
                    if (!this.featureConfiguration.isEditItemDefinitionsEnabled()) {
                        const errorMessage = vscode.l10n.t('Editing definition files is disabled. Enable the "Fabric.EditItemDefinitions" setting to edit.');
                        throw vscode.FileSystemError.NoPermissions(errorMessage);
                    }

                    // Resolve the current definition
                    let definition: IItemDefinition;
                    const cached = this.getCachedItemDefinition(workspaceId, artifactId);
                    if (cached) {
                        definition = cached.definition;
                    }
                    else {
                        const response = await this.artifactManager.getArtifactDefinition(artifact);
                        if (!response.parsedBody?.definition) {
                            throw new Error('Failed to get current artifact definition');
                        }
                        definition = response.parsedBody.definition;
                    }

                    const isFile = this.fileCache.has(uri.toString());
                    const changedUris: vscode.Uri[] = [];

                    if (isFile) {
                        // Delete a single file
                        const partIndex = definition.parts.findIndex(p => p.path === filePath);
                        if (partIndex === -1) {
                            throw vscode.FileSystemError.FileNotFound(uri);
                        }
                        definition.parts.splice(partIndex, 1);
                        this.fileCache.delete(uri.toString());
                        this.artifactCache.delete(uri.toString());
                        changedUris.push(uri);
                    }
                    else if (options.recursive) {
                        // Delete all files under the directory
                        const dirPrefix = filePath + '/';
                        const partsToRemove = definition.parts.filter(p => p.path.startsWith(dirPrefix));

                        if (partsToRemove.length === 0) {
                            throw vscode.FileSystemError.FileNotFound(uri);
                        }

                        for (const part of partsToRemove) {
                            const partUri = vscode.Uri.parse(
                                `${DefinitionFileSystemProvider.scheme}:///${workspaceId}/${artifactId}/${part.path}`
                            );
                            this.fileCache.delete(partUri.toString());
                            this.artifactCache.delete(partUri.toString());
                            changedUris.push(partUri);
                        }

                        definition.parts = definition.parts.filter(p => !p.path.startsWith(dirPrefix));
                    }
                    else {
                        // Non-recursive delete on a directory - not allowed
                        throw vscode.FileSystemError.NoPermissions('Cannot delete a directory without recursive flag');
                    }

                    // Update the item definition cache
                    this.itemDefinitionCache.set(this.getItemCacheKey(workspaceId, artifactId), {
                        artifact,
                        definition,
                        cachedAt: Date.now(),
                    });

                    // Push the updated definition to the server
                    await this.artifactManager.updateArtifactDefinition(
                        artifact,
                        definition,
                        vscode.Uri.file('')
                    );

                    // Fire delete events
                    this._emitter.fire(changedUris.map(u => ({ type: vscode.FileChangeType.Deleted, uri: u })));

                    activity.addOrUpdateProperties({ result: 'Succeeded' });
                }
                catch (error: any) {
                    activity.addOrUpdateProperties({ result: 'Failed' });
                    throw error;
                }
            });
        });
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Renaming files is not supported');
    }
}
