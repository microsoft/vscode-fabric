// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IArtifactManager, IFabricExtension, IFabricExtensionManager, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, IWorkspaceManager, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { SqlDatabaseTreeNodeProvider } from './SqlDatabaseTreeNodeProvider';
import { SqlEndpointTreeNodeProvider } from './SqlEndpointTreeNodeProvider';
import { WarehouseTreeNodeProvider } from './WarehouseTreeNodeProvider';
import { SqlSatelliteCommandManager } from './SqlSatelliteCommandManager';

export class SqlExtension implements IFabricExtension, vscode.Disposable {
    private workspaceManager: IWorkspaceManager;
    private artifactManager: IArtifactManager;
    private apiClient: IFabricApiClient;
    private commandManager: SqlSatelliteCommandManager;

    public identity: string = 'fabric.internal-satellite-sql';
    public apiVersion: string = apiVersion;
    public artifactTypes: string[] = ['SQLDatabase', 'SQLEndpoint', 'Warehouse'];
    public treeNodeProviders: IFabricTreeNodeProvider[] = [
        new SqlDatabaseTreeNodeProvider(this.context),
        new SqlEndpointTreeNodeProvider(this.context),
        new WarehouseTreeNodeProvider(this.context),
    ];
    public localProjectTreeNodeProviders: ILocalProjectTreeNodeProvider[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        private logger: ILogger,
        private extensionManager: IFabricExtensionManager,
        private fabricEnvironmentProvider: IFabricEnvironmentProvider
    ) {
        const serviceCollection = extensionManager.addExtension(this);

        this.workspaceManager = serviceCollection.workspaceManager;
        this.artifactManager = serviceCollection.artifactManager;
        this.apiClient = serviceCollection.apiClient;

        // Initialize satellite-specific command manager
        this.commandManager = new SqlSatelliteCommandManager(
            this.logger,
            this.telemetryService,
            this.context,
            this.fabricEnvironmentProvider,
            this.workspaceManager,
            this.artifactManager,
            this.apiClient
        );

        // Initialize commands
        void this.commandManager.initialize();
    }

    dispose() {
        this.commandManager.dispose();
    }
}
