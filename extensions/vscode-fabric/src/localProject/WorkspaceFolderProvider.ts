import * as vscode from 'vscode';
import { IWorkspaceFolderProvider } from './definitions';
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

    private constructor(private logger: ILogger, private telemetryService: TelemetryService) {
    }

    public static async create(logger: ILogger, telemetryService: TelemetryService): Promise<WorkspaceFolderProvider> {
        const provider = new WorkspaceFolderProvider(logger, telemetryService);
        await provider.scan();
        return provider;
    }

    private async scan() {
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                await withErrorHandling('WorkspaceFolderProvider.scan', this.logger, this.telemetryService, async () => {
                    // The workspaceFolders should only contain directories, but the directory may not exist
                    if (await isDirectory(vscode.workspace.fs, folder.uri)) {
                        this.workspaceFolders.add(folder.uri);

                        // Read directory returns a tuple of the file name and the file type
                        const directoryInformation = await vscode.workspace.fs.readDirectory(folder.uri);
                        for (const current of directoryInformation) {
                            if (current[1] === vscode.FileType.Directory) {
                                this.workspaceFolders.add(vscode.Uri.joinPath(folder.uri, current[0]));
                            }
                        }

                        // Add a listener FileSystemWatcher to detect when a directory is added or removed
                        const watcher = new WorkspaceFolderWatcher(folder.uri, this.workspaceFolders);
                        this.disposables.push(watcher);
                    }
                })();
            }
        }
    }

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}

class WorkspaceFolderWatcher implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | undefined;

    constructor(folder: vscode.Uri, folderCollection: IObservableArray<vscode.Uri>) {
        // Only test top-level directories since ALM only supports this (for now)
        // That may change once Fabric folders are supported
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '*'));
        this.watcher.onDidDelete(async (uri: vscode.Uri) => {
            if (await isDirectory(vscode.workspace.fs, uri, true)) { // The item no longer exists, so it might have been a directory. Let's assume it was to be safe.
                folderCollection.remove(uri);
            }
        });
        this.watcher.onDidCreate(async (uri: vscode.Uri) => {
            if (await isDirectory(vscode.workspace.fs, uri)) {
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
