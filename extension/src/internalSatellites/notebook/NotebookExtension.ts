// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IFabricExtension, IFabricExtensionManager, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, IWorkspaceManager, IArtifactHandler } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNodeProvider } from './NotebookTreeNodeProvider';
import { NotebookArtifactHandler } from './NotebookArtifactHandler';
import { registerNotebookCommands, disposeCommands } from './commands';
import { TelemetryService } from '@microsoft/vscode-fabric-util';

export class NotebookExtension implements IFabricExtension, vscode.Disposable{
    public identity: string = 'fabric.internal-satellite-notebook';
    public apiVersion: string = apiVersion;
    public artifactTypes: string[] = ['Notebook'];
    public treeNodeProviders: IFabricTreeNodeProvider[] = [
        new NotebookTreeNodeProvider(this.context),
    ];
    public localProjectTreeNodeProviders: ILocalProjectTreeNodeProvider[] = [];
    public artifactHandlers: IArtifactHandler[] = [
        new NotebookArtifactHandler(),
    ];

    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        extensionManager: IFabricExtensionManager
    ) {
        const serviceCollection = extensionManager.addExtension(this);

        const workspaceManager = serviceCollection.workspaceManager;
        const artifactManager = serviceCollection.artifactManager;

        registerNotebookCommands(
            this.context,
            workspaceManager,
            artifactManager,
            this.telemetryService
        );
    }

    dispose() {
        disposeCommands();
    }
}
