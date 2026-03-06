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

    public createDirectory(_uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions('Creating directories is not supported yet');
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const parsed = this.parseOneLakeUri(uri);
        return this.oneLakeDfsClient.readFile(parsed.storageWorkspaceId, parsed.storageLakehouseId, parsed.filePath);
    }

    public writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions('Writing files is not supported yet');
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
}
