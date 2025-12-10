// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IObservableArray } from '../collections/definitions';
import { isDirectory } from '../utilities';

export class WorkspaceFolderWatcher implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | undefined;

    constructor(folder: vscode.Uri, private fileSystem: vscode.FileSystem, folderCollection: IObservableArray<vscode.Uri>) {
        // Only test top-level directories since ALM only supports this (for now)
        // That may change once Fabric folders are supported
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**'));
        this.watcher.onDidDelete(async (uri: vscode.Uri) => {
            if (await isDirectory(this.fileSystem, uri, true)) { // The item no longer exists, so it might have been a directory. Let's assume it was to be safe.
                folderCollection.remove(uri);
            }
        });
        this.watcher.onDidCreate(async (uri: vscode.Uri) => {
            if (await isDirectory(this.fileSystem, uri)) {
                folderCollection.add(uri);
            }
        });
    }

    dispose() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = undefined;
        }
    }
}
