// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricCommandManager, ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IFabricApiClient, IArtifactManager } from '@microsoft/vscode-fabric-api';
import * as vscode from 'vscode';
import { ISqlSatelliteCommandManager } from './ISqlSatelliteCommandManager';

/**
 * Command manager for SQL satellite extension that extends the base FabricCommandManager
 * with satellite-specific dependencies.
 * 
 * This is a lightweight wrapper that adds satellite-specific properties to the base command manager.
 */
export class SqlSatelliteCommandManager extends FabricCommandManager implements ISqlSatelliteCommandManager {
    constructor(
        logger: ILogger,
        telemetryService: TelemetryService | null,
        extensionContext: vscode.ExtensionContext,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly artifactManager: IArtifactManager,
        public readonly apiClient: IFabricApiClient
    ) {
        super(logger, telemetryService, extensionContext, fabricEnvironmentProvider);
    }

    /**
     * Initialize command manager and register all satellite commands
     */
    public async initialize(): Promise<void> {
        this.logger.log('[SqlSatellite] Initializing command manager...');

        // Register satellite-specific commands
        const { OpenSqlExtensionCommand } = await import('./OpenSqlExtensionCommand');
        const { CopyConnectionStringCommand } = await import('./CopyConnectionStringCommand');

        this.registerCommand(new OpenSqlExtensionCommand(this));
        this.registerCommand(new CopyConnectionStringCommand(this));

        this.logger.log('[SqlSatellite] Command manager initialized');
    }
}
