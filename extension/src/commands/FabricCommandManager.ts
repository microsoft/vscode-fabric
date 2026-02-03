// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';
import { IFabricCommandManager, IFabricCommand } from './IFabricCommandManager';
import { EditItemDefinitionCommand } from './EditItemDefinitionCommand';
import { CreateFolderCommand, DeleteFolderCommand, RenameFolderCommand } from '../folders';

/**
 * Implementation of the Fabric command manager that handles command registration,
 * dependency injection, and lifecycle management using constructor-based DI
 */
export class FabricCommandManager implements IFabricCommandManager {
    private readonly commands = new Map<string, IFabricCommand>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        // All dependencies injected through constructor - DI framework will provide these
        public readonly logger: ILogger,
        public readonly telemetryService: TelemetryService | null,
        public readonly extensionContext: vscode.ExtensionContext,
        public readonly fabricEnvironmentProvider: IFabricEnvironmentProvider,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly artifactManager: IArtifactManagerInternal,
        public readonly capacityManager: ICapacityManager,
        public readonly dataProvider: FabricWorkspaceDataProvider,
        public readonly workspaceFilterManager: IWorkspaceFilterManager,
        public readonly extensionManager: IFabricExtensionManagerInternal
    ) {}

    // Private command management methods
    private registerCommand(command: IFabricCommand): vscode.Disposable {
        // Register the command with VS Code
        const disposable = vscode.commands.registerCommand(
            command.commandName,
            (...args: any[]) => command.execute(...args)
        );

        // Track the command and disposable
        this.commands.set(command.commandName, command);
        this.disposables.push(disposable);
        this.extensionContext.subscriptions.push(disposable);

        this.logger.log(`Registered command: ${command.commandName}`);
        return disposable;
    }

    // Lifecycle methods
    public async initialize(): Promise<void> {
        this.logger.log('FabricCommandManager initializing...');

        // Dispose any existing commands first
        this.dispose();

        // Create and register all command instances
        await this.createAndRegisterCommands();

        this.logger.log(`FabricCommandManager initialized with ${this.commands.size} commands`);
    }

    public dispose(): void {
        // Dispose all command registrations
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.commands.clear();

        this.logger.log('FabricCommandManager disposed');
    }

    // Private methods
    private async createAndRegisterCommands(): Promise<void> {
        // This is where we'll instantiate all our command classes
        // Commands will be created as we migrate them

        // Definition file editing
        const editItemDefinitionCommand = new EditItemDefinitionCommand(this);
        this.registerCommand(editItemDefinitionCommand);

        // Folder commands
        const createFolderCommand = new CreateFolderCommand(this);
        this.registerCommand(createFolderCommand);

        const deleteFolderCommand = new DeleteFolderCommand(this);
        this.registerCommand(deleteFolderCommand);

        const renameFolderCommand = new RenameFolderCommand(this);
        this.registerCommand(renameFolderCommand);

        // Example of how commands will be registered:
        // const createArtifactCommand = new CreateArtifactCommand(this);
        // this.registerCommand(createArtifactCommand);

        // const readArtifactCommand = new ReadArtifactCommand(this);
        // this.registerCommand(readArtifactCommand);

        // TODO: Add all command instantiations here as we migrate them
    }
}
