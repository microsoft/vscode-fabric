// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { DefinitionFileSystemProvider } from './DefinitionFileSystemProvider';

/**
 * A readonly wrapper around DefinitionFileSystemProvider for the fabric-definition-virtual:// scheme.
 * This provider allows viewing definition files (including notebooks) but blocks write operations.
 */
export class ReadonlyDefinitionFileSystemProvider implements vscode.FileSystemProvider {
    public static readonly scheme = 'fabric-definition-virtual';

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    constructor(private readonly innerProvider: DefinitionFileSystemProvider) {}

    /**
     * Creates a readonly URI for a definition file.
     * @param workspaceId The workspace ID
     * @param artifactId The artifact ID
     * @param fileName The file name/path
     * @returns A URI with the fabric-definition-virtual scheme
     */
    static createUri(workspaceId: string, artifactId: string, fileName: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: ReadonlyDefinitionFileSystemProvider.scheme,
            path: `/${workspaceId}/${artifactId}/${fileName}`,
        });
    }

    /**
     * Converts virtual URI to editable URI for delegation
     */
    private toEditableUri(uri: vscode.Uri): vscode.Uri {
        return uri.with({ scheme: DefinitionFileSystemProvider.scheme });
    }

    // Read operations - delegate to inner provider

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return this.innerProvider.stat(this.toEditableUri(uri));
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return this.innerProvider.readDirectory(this.toEditableUri(uri));
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        return this.innerProvider.readFile(this.toEditableUri(uri));
    }

    // Write operations - throw readonly errors

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(oldUri);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    // Watch operation - delegate to inner provider
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return this.innerProvider.watch(this.toEditableUri(uri), options);
    }
}
