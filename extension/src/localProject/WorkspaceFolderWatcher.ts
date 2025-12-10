// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IObservableArray } from '../collections/definitions';
import { isDirectory, isParentOf } from '../utilities';

export class WorkspaceFolderWatcher implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | undefined;

    constructor(folder: vscode.Uri, private fileSystem: vscode.FileSystem, folderCollection: IObservableArray<vscode.Uri>) {
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**'));
        this.watcher.onDidDelete(async (uri: vscode.Uri) => {
            if (await isDirectory(this.fileSystem, uri, true)) { // The item no longer exists, so it might have been a directory. Let's assume it was to be safe.
                // Remove the deleted directory
                folderCollection.remove(uri);

                // Remove all descendants of the deleted directory
                const foldersToRemove = folderCollection.items.filter(item => isParentOf(uri, item));
                for (const descendant of foldersToRemove) {
                    folderCollection.remove(descendant);
                }
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
