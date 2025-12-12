// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IWorkspaceFolderProvider } from './definitions';
import { WorkspaceFolderWatcher } from './WorkspaceFolderWatcher';
import { IObservableArray } from '../collections/definitions';
import { ObservableSet } from '../collections/ObservableSet';
import { isDirectory } from '../utilities';
import { withErrorHandling, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

export class WorkspaceFolderProvider implements IWorkspaceFolderProvider, vscode.Disposable {
    /**
     * Observable collection of workspace folders.
     *
     * Note: Event handlers (such as onItemAdded/onItemRemoved) may be asynchronous.
     * The add/remove methods on this collection do not await completion of async event handlers.
     * As a result, consumers should not assume that all side effects of add/remove
     * (such as updates in dependent components) are complete immediately after mutation.
     *
     * This pattern results in eventual consistency: the collection and any listeners
     * will be updated asynchronously, but not necessarily synchronously.
     */
    public workspaceFolders: IObservableArray<vscode.Uri> = new ObservableSet<vscode.Uri>([], (a, b) => a.toString(true) === b.toString(true));
    private disposables: vscode.Disposable[] = [];

    private constructor(private fileSystem: vscode.FileSystem, private logger: ILogger, private telemetryService: TelemetryService) {
    }

    public static async create(fileSystem: vscode.FileSystem, logger: ILogger, telemetryService: TelemetryService): Promise<WorkspaceFolderProvider> {
        const provider = new WorkspaceFolderProvider(fileSystem, logger, telemetryService);
        await provider.scan();
        return provider;
    }

    private async scan() {
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                await withErrorHandling('WorkspaceFolderProvider.scan', this.logger, this.telemetryService, async () => {
                    // The workspaceFolders should only contain directories, but the directory may not exist
                    if (await isDirectory(this.fileSystem, folder.uri)) {
                        // Recursively scan the workspace folder and all subdirectories
                        await this.scanFolderRecursively(folder.uri);

                        // Add a listener FileSystemWatcher to detect when a directory is added or removed
                        const watcher = new WorkspaceFolderWatcher(folder.uri, this.fileSystem, this.workspaceFolders);
                        this.disposables.push(watcher);
                    }
                })();
            }
        }
    }

    private async scanFolderRecursively(folderUri: vscode.Uri): Promise<void> {
        // Add the current folder to the collection
        this.workspaceFolders.add(folderUri);

        // Read directory returns a tuple of the file name and the file type
        const directoryInformation = await this.fileSystem.readDirectory(folderUri);

        // Process all subdirectories recursively
        for (const current of directoryInformation) {
            if (current[1] === vscode.FileType.Directory) {
                const subdirUri = vscode.Uri.joinPath(folderUri, current[0]);
                await this.scanFolderRecursively(subdirUri);
            }
        }
    }

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}
