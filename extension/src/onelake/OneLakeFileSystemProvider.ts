// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { OneLakeDfsClient } from './OneLakeDfsClient';

interface ParsedOneLakeUri {
    storageWorkspaceId: string;
    storageLakehouseId: string;
    filePath: string;
}

export class OneLakeFileSystemProvider implements vscode.FileSystemProvider {
    public static readonly scheme = 'onelake';

    private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    public constructor(
        private readonly oneLakeDfsClient: OneLakeDfsClient
    ) {
    }

    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: readonly string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const parsed = this.parseOneLakeUri(uri);
        const content = await this.oneLakeDfsClient.readFile(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath);

        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.length,
        };
    }

    public readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
        throw vscode.FileSystemError.NoPermissions('Reading directories is not supported yet');
    }

    public async createDirectory(uri: vscode.Uri): Promise<void> {
        const parsed = this.parseOneLakeUri(uri);
        await this.oneLakeDfsClient.createDirectory(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath);
        this.emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const parsed = this.parseOneLakeUri(uri);
        return this.oneLakeDfsClient.readFile(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath);
    }

    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
        const parsed = this.parseOneLakeUri(uri);

        const fileExists = await this.fileExists(uri);
        if (!fileExists && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        if (fileExists && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }

        await this.ensureParentDirectories(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath);
        await this.oneLakeDfsClient.writeFile(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath, content);

        this.emitter.fire([{ type: fileExists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
    }

    public delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Deleting files is not supported yet');
    }

    public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Renaming files is not supported yet');
    }

    private parseOneLakeUri(uri: vscode.Uri): ParsedOneLakeUri {
        if (uri.scheme !== OneLakeFileSystemProvider.scheme) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const pathSegments = uri.path.split('/').filter(segment => segment.length > 0);
        if (pathSegments.length < 3) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const storageWorkspaceId = pathSegments[0];
        const storageLakehouseId = pathSegments[1];
        const filePath = pathSegments.slice(2).join('/');

        return {
            storageWorkspaceId,
            storageLakehouseId,
            filePath,
        };
    }

    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await this.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    }

    private async ensureParentDirectories(storageWorkspaceId: string, storageLakehouseId: string, filePath: string): Promise<void> {
        const parts = filePath.split('/').filter(part => part.length > 0);
        if (parts.length <= 1) {
            return;
        }

        let currentPath = '';
        for (const part of parts.slice(0, -1)) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            await this.oneLakeDfsClient.createDirectory(storageWorkspaceId, storageLakehouseId, currentPath);
        }
    }
}
