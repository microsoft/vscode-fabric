// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ILogger, TelemetryService, IFabricEnvironmentProvider, IFabricCommandBase } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IFabricApiClient, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { ISqlSatelliteCommandManager } from './ISqlSatelliteCommandManager';

/**
 * Command manager implementation for SQL satellite extension
 * Manages command registration and lifecycle for database-related commands
 */
export class SqlSatelliteCommandManager implements ISqlSatelliteCommandManager {
    private readonly commands = new Map<string, IFabricCommandBase>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        public readonly logger: ILogger,
        public readonly telemetryService: TelemetryService | null,
        public readonly extensionContext: vscode.ExtensionContext,
        public readonly fabricEnvironmentProvider: IFabricEnvironmentProvider,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly artifactManager: IArtifactManager,
        public readonly apiClient: IFabricApiClient
    ) {}

    /**
     * Register a command with VS Code
     */
    public registerCommand(command: IFabricCommandBase): vscode.Disposable {
        const disposable = vscode.commands.registerCommand(
            command.commandName,
            (...args: any[]) => command.execute(...args)
        );

        this.commands.set(command.commandName, command);
        this.disposables.push(disposable);
        this.extensionContext.subscriptions.push(disposable);

        this.logger.log(`[SqlSatellite] Registered command: ${command.commandName}`);
        return disposable;
    }

    /**
     * Initialize command manager and register all commands
     */
    public async initialize(): Promise<void> {
        this.logger.log('[SqlSatellite] Initializing command manager...');

        // Dispose any existing commands first
        this.dispose();

        // Register satellite-specific commands
        await this.createAndRegisterCommands();

        this.logger.log(`[SqlSatellite] Command manager initialized with ${this.commands.size} commands`);
    }

    /**
     * Dispose all registered commands
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.commands.clear();

        this.logger.log('[SqlSatellite] Command manager disposed');
    }

    /**
     * Create and register all satellite commands
     */
    private async createAndRegisterCommands(): Promise<void> {
        // Import and register database commands
        const { OpenSqlExtensionCommand } = await import('./OpenSqlExtensionCommand');
        const { CopyConnectionStringCommand } = await import('./CopyConnectionStringCommand');

        this.registerCommand(new OpenSqlExtensionCommand(this));
        this.registerCommand(new CopyConnectionStringCommand(this));
    }
}
