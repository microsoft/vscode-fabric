import * as vscode from 'vscode';
import { ILogger, TelemetryService, IFabricEnvironmentProvider, IFabricCommandManagerBase, IFabricCommandBase } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

/**
 * Interface for commands that the command manager can execute
 */
export interface IFabricCommand<TEventName extends string = string> extends IFabricCommandBase<TEventName> {
}

/**
 * Interface for the command manager that handles command registration and execution
 * Extends the base interface with extension-specific dependencies
 */
export interface IFabricCommandManager extends IFabricCommandManagerBase {
    // Extension-specific dependencies
    readonly workspaceManager: IWorkspaceManager;
    readonly artifactManager: IArtifactManagerInternal;
    readonly capacityManager: ICapacityManager;
    readonly dataProvider: FabricWorkspaceDataProvider;
    readonly workspaceFilterManager: IWorkspaceFilterManager;
    readonly extensionManager: IFabricExtensionManagerInternal;
    readonly apiClient: IFabricApiClient;

    // Lifecycle methods
    initialize(): Promise<void>;
    dispose(): void;
}
