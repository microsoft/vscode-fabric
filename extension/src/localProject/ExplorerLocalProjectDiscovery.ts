// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ILocalProjectDiscovery, ILocalProjectInformation, IWorkspaceFolderProvider } from './definitions';
import { tryParseLocalProjectData } from '@microsoft/vscode-fabric-util';
import { IObservableArray } from '../collections/definitions';
import { ObservableSet } from '../collections/ObservableSet';

// Default implementation of the ILocalProjectDiscovery interface
export class ExplorerLocalProjectDiscovery implements ILocalProjectDiscovery {
    public projects: IObservableArray<ILocalProjectInformation> = new ObservableSet<ILocalProjectInformation>(
        [],
        (a, b) => a.path.toString(true) === b.path.toString(true)
    );

    private constructor(private workspaceFolderProvider: IWorkspaceFolderProvider) {
    }

    /**
     * Creates a new ExplorerLocalProjectDiscovery and begins monitoring workspace folders.
     *
     * Note: Updates to the `projects` collection in response to workspace folder changes
     * are handled asynchronously. This means that immediately after a folder is added or removed
     * from the workspace, the `projects` collection may not yet reflect the change.
     * Consumers should not assume immediate consistency and may need to wait for the async
     * update to complete if up-to-date state is required.
     */
    public static async create(workspaceFolderProvider: IWorkspaceFolderProvider): Promise<ExplorerLocalProjectDiscovery> {
        const discovery = new ExplorerLocalProjectDiscovery(workspaceFolderProvider);
        await discovery.scan();
        discovery.workspaceFolderProvider.workspaceFolders.onItemAdded(async (uri: vscode.Uri) => {
            await discovery.addIfProject(uri);
        });
        discovery.workspaceFolderProvider.workspaceFolders.onItemRemoved((uri: vscode.Uri) => {
            const info = discovery.projects.items.find((item) => item.path.toString(true) === uri.toString(true));
            if (info) {
                discovery.projects.remove(info);
            }
        });
        return discovery;
    }

    private async scan() {
        for (const folder of this.workspaceFolderProvider.workspaceFolders.items) {
            await this.addIfProject(folder);
        }
    }

    private async addIfProject(folder: vscode.Uri) {
        const data = await tryParseLocalProjectData(folder);
        if (data) {
            this.projects.add({
                artifactType: data.type,
                path: folder,
            });
        }
    }
}
