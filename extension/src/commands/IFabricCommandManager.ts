import * as vscode from 'vscode';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

/**
 * Interface for commands that the command manager can execute
 */
export interface IFabricCommand<TEventName extends string = string> {
    readonly commandName: string;
    readonly telemetryEventName: TEventName;
    execute(...args: any[]): Promise<any>;
    canExecute?(...args: any[]): boolean;
}

/**
 * Interface for the command manager that handles command registration and execution
 */
export interface IFabricCommandManager {
    // Dependencies as readonly properties
    readonly logger: ILogger;
    readonly telemetryService: TelemetryService | null;
    readonly extensionContext: vscode.ExtensionContext;
    readonly fabricEnvironmentProvider: IFabricEnvironmentProvider;
    readonly workspaceManager: IWorkspaceManager;
    readonly artifactManager: IArtifactManagerInternal;
    readonly capacityManager: ICapacityManager;
    readonly dataProvider: FabricWorkspaceDataProvider;
    readonly workspaceFilterManager: IWorkspaceFilterManager;
    readonly extensionManager: IFabricExtensionManagerInternal;

    // Command management methods
    registerCommand(command: IFabricCommand): vscode.Disposable;
    unregisterCommand(commandName: string): void;
    getCommand(commandName: string): IFabricCommand | undefined;

    // Lifecycle methods
    initialize(): Promise<void>;
    dispose(): void;
}
