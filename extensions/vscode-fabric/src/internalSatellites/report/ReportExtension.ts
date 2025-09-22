// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IFabricExtension, IFabricExtensionManager, IArtifactHandler } from '@microsoft/vscode-fabric-api';
import { ReportArtifactHandler } from './ReportArtifactHandler';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { IWorkspaceFilterManager } from '../../workspace/WorkspaceFilterManager';

export class ReportExtension implements IFabricExtension, vscode.Disposable {
    public identity: string = 'fabric.internal-satellite-report';
    public apiVersion: string = apiVersion;
    public artifactTypes: string[] = ['Report'];
    public artifactHandlers: IArtifactHandler[] = [];
    public treeNodeProviders: any[] = [];
    public localProjectTreeNodeProviders: any[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        private logger: ILogger,
        private workspaceFilterManager: IWorkspaceFilterManager,
        extensionManager: IFabricExtensionManager
    ) {
        // Create handler first (no deps yet) so artifactHandlers populated before registration
        const handler = new ReportArtifactHandler();
        this.artifactHandlers.push(handler);
        const serviceCollection = extensionManager.addExtension(this);
        // Now initialize handler with required services
        handler.initialize(
            serviceCollection.workspaceManager,
            serviceCollection.artifactManager,
            this.telemetryService,
            this.logger,
            this.workspaceFilterManager
        );
    }

    dispose(): void {
        // nothing to dispose yet
    }
}
