// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IFabricExtension, IFabricExtensionManager, IArtifactHandler } from '@microsoft/vscode-fabric-api';
import { SemanticModelArtifactHandler } from './SemanticModelArtifactHandler';

export class SemanticModelExtension implements IFabricExtension, vscode.Disposable {
    public identity: string = 'fabric.internal-satellite-semanticmodel';
    public apiVersion: string = apiVersion;
    public artifactTypes: string[] = ['SemanticModel'];
    public artifactHandlers: IArtifactHandler[] = [];
    public treeNodeProviders: any[] = [];
    public localProjectTreeNodeProviders: any[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManager
    ) {
        // Create handler and register it
        const handler = new SemanticModelArtifactHandler();
        this.artifactHandlers.push(handler);
        extensionManager.addExtension(this);
    }

    dispose(): void {
        // nothing to dispose yet
    }
}
