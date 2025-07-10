import * as vscode from 'vscode';
import { ILocalProjectDiscovery, ILocalProjectInformation, IWorkspaceFolderProvider } from './definitions';
import { tryParseArtifactType } from './utilities';
import { IObservableArray } from '../collections/definitions';
import { ObservableSet } from '../collections/ObservableSet';

// Default implementation of the ILocalProjectDiscovery interface
export class ExplorerLocalProjectDiscovery implements ILocalProjectDiscovery {
    public projects: IObservableArray<ILocalProjectInformation> = new ObservableSet<ILocalProjectInformation>(
        [], 
        (a, b) => a.path.toString(true) === b.path.toString(true)
    );

    constructor(private workspaceFolderProvider: IWorkspaceFolderProvider) {
        this.scan();
        this.workspaceFolderProvider.workspaceFolders.onItemAdded((uri: vscode.Uri) => this.addIfProject(uri));
        this.workspaceFolderProvider.workspaceFolders.onItemRemoved((uri: vscode.Uri) => {
            const info = this.projects.items.find((item) => item.path.toString(true) === uri.toString(true));
            if (info) {
                this.projects.remove(info);
            }
        });
    }

    private scan() {
        this.workspaceFolderProvider.workspaceFolders.items.forEach(folder => {
            this.addIfProject(folder);
        });
    }

    private addIfProject(folder: vscode.Uri) {
        const artifactType: string | undefined = tryParseArtifactType(folder);
        if (artifactType) {
            this.projects.add({
                artifactType: artifactType,
                path: folder,
            });
        }
    }
}