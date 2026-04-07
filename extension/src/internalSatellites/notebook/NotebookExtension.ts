// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IFabricExtension, IFabricExtensionManager, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, IArtifactHandler } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNodeProvider } from './NotebookTreeNodeProvider';
import { NotebookArtifactHandler } from './NotebookArtifactHandler';
import { registerNotebookCommands, disposeCommands } from './commands';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';

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
        private logger: ILogger,
        extensionManager: IFabricExtensionManager
    ) {
        extensionManager.addExtension(this);

        registerNotebookCommands(
            this.context,
            this.telemetryService,
            this.logger
        );
    }

    dispose() {
        disposeCommands();
    }
}
