// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IApiClientResponse, IFabricApiClient, IItemDefinition } from './FabricApiClient';
import { IFabricExtension } from './satelliteFabricExtension';
import { ArtifactTreeNode, FabricTreeNode } from './treeView';

/**
 * The kind of operation that can be requested of an artifact. See {@link IArtifactManager}
 *
 * @deprecated - Use artifact workflows instead
 */
export enum OperationRequestType {
    none = 0,
    create = 1 << 0,
    select = 1 << 1,
    update = 1 << 2,
    delete = 1 << 3,
    all = ~(~0 << 4)
}

/**
 * Namespace containing schema constants and identifiers used throughout the Fabric extension.
 */
export namespace Schema {
    /**
     * URI scheme identifier for Fabric virtual documents.
     * Used to create virtual document URIs that represent Fabric content within VS Code
     * without requiring actual files on the local filesystem.
     */
    export const fabricVirtualDoc = 'fabric-virtual-doc';
}

/**
 * @deprecated - Use IGetArtifactDefinitionWorkflow instead.
 */
export interface IOpenArtifactOptions {
    folder: vscode.Uri;
}

/**
 * Collection of core services provided by the main Fabric extension for use by satellite extensions.
 *
 * This interface defines the primary service contract that satellite extensions can use to interact
 * with Fabric workspaces, artifacts, and API endpoints. It provides a stable API surface that allows
 * satellite extensions to extend Fabric functionality without directly depending on internal
 * implementation details.
 *
 * The service collection is obtained by accessing the exports of the main Fabric extension and
 * provides access to the three core service areas: artifact management, workspace management,
 * and direct API client access.
 *
 * @example
 * ```typescript
 * import * as fabricExt from '@microsoft/vscode-fabric-api';
 *
 * export function activate(context: vscode.ExtensionContext) {
 *   const fabricServices: fabricExt.IFabricExtensionServiceCollection =
 *     vscode.extensions.getExtension('fabric.vscode-fabric')!.exports;
 *
 *   // Use the services
 *   const artifacts = await fabricServices.artifactManager.listArtifacts(workspace);
 * }
 * ```
 */
export interface IFabricExtensionServiceCollection {
    /**
     * Service for managing Fabric artifacts (items) including CRUD operations and definition handling.
     * Provides high-level operations for creating, reading, updating, and deleting Fabric artifacts.
     */
    artifactManager: IArtifactManager;

    /**
     * Service for managing Fabric workspaces and local folder mappings.
     * Handles workspace listing, creation, and local file system integration.
     */
    workspaceManager: IWorkspaceManager;

    /**
     * Direct access to the low-level Fabric API client for custom HTTP operations.
     * Use this for API calls not covered by the higher-level managers.
     */
    apiClient: IFabricApiClient;
}

/**
 * High-level service for managing Microsoft Fabric artifacts (items) through the Fabric REST API.
 *
 * This interface provides comprehensive artifact lifecycle management including creation, retrieval,
 * updates, deletion, and definition handling. It abstracts the complexity of the underlying REST API
 * and provides a simplified interface for satellite extensions to work with Fabric content.
 *
 * The artifact manager handles both metadata operations (artifact properties) and content operations
 * (artifact definitions containing the actual files and data). It integrates with the local file
 * system to support round-trip editing workflows where artifacts can be downloaded, modified locally,
 * and uploaded back to Fabric.
 *
 * @example
 * ```typescript
 * // Create a new notebook
 * const notebook: IArtifact = {
 *   displayName: 'My Notebook',
 *   type: 'Notebook',
 *   workspaceId: 'workspace-id',
 *   // ... other properties
 * };
 * await artifactManager.createArtifact(notebook);
 *
 * // Get artifact definition for editing
 * const definition = await artifactManager.getArtifactDefinition(notebook);
 * ```
 */
export interface IArtifactManager {
    /**
     * Creates the specified artifact on the Fabric back end
     *
     * @param artifact - The artifact to create
     */
    createArtifact(artifact: IArtifact, itemSpecificMetadata?: any): Promise<IApiClientResponse>;

    /**
     * Creates an item in the specified workspace using the specified definition
     *
     * @param artifact - The artifact to create
     * @param definition - The item definition to use for creating the artifact
     * @param folder - The folder where the item definition was created from
     * @param options - Optional parameters for the creation operation
     */
    createArtifactWithDefinition(
        artifact: IArtifact,
        definition: IItemDefinition,
        folder: vscode.Uri,
        options?: {
            /**
             * Optional progress reporter to track the progress of the creation operation
             */
            progress?: vscode.Progress<{ message?: string; increment?: number }>;
        }
    ): Promise<IApiClientResponse>;

    /**
     * Gets the specified artifact on the Fabric back end
     *
     * @param artifact - The artifact to get
     */
    getArtifact(artifact: IArtifact): Promise<IApiClientResponse>;

    /**
     * Returns a list of items from the specified workspace
     *
     * @param workspace - The workspace to list artifacts for
     * @returns A list of artifacts in the specified workspace
     * @throws FabricError if the request fails
     */
    listArtifacts(workspace: IWorkspace): Promise<IArtifact[]>;

    /**
     * Updates the specified artifact from the Fabric back end
     *
     * @param artifact - The artifact to update
     */
    updateArtifact(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse>;

    /**
     * Deletes the specified artifact from the Fabric back end
     *
     * @param artifact - The artifact to delete
     */
    deleteArtifact(artifact: IArtifact): Promise<IApiClientResponse>;

    /**
     * Gets the definition for the specified artifact from the Fabric back end
     *
     * @param artifact - The artifact to get the definition for
     * @param folder - The location the item definition will be saved to
     * @param options - Optional parameters for the get operation
     */
    getArtifactDefinition(
        artifact: IArtifact,
        folder?: vscode.Uri,
        options?: {
            /**
             * Optional progress reporter to track the progress of the get operation
             */
            progress?: vscode.Progress<{ message?: string; increment?: number }>;
        }
    ): Promise<IApiClientResponse>;

    /**
     * Updates the definition for the specified artifact on the Fabric back end
     *
     * @param artifact - The artifact to update
     * @param definition - The item definition to use for updating the artifact
     * @param folder - The folder where the item definition was created from
     * @param options - Optional parameters for the update operation
     */
    updateArtifactDefinition(
        artifact: IArtifact,
        definition: IItemDefinition,
        folder: vscode.Uri,
        options?: {
            /**
             * Optional progress reporter to track the progress of the update operation
             */
            progress?: vscode.Progress<{ message?: string; increment?: number }>;
        }
    ): Promise<IApiClientResponse>;

    /**
     * Gets the specified artifact from the Fabric back end
     *
     * @deprecated - use IReadArtifactWorkflow instead
     * @param artifact - The artifact to fetch
     */
    selectArtifact(artifact: IArtifact): Promise<IApiClientResponse>;

    /**
     * Opens the artifact with the specified options
     *
     * @deprecated - use getArtifactDefinition instead
     * @param artifact - The artifact to open
     * @remarks  The request is fully handled by the {@link IArtifactHandler}
     */
    openArtifact(artifact: IArtifact): Promise<void>;

    /**
     * @deprecated
     */
    getArtifactData(artifact: IArtifact): Promise<IApiClientResponse>;

    /**
     * @deprecated
     */
    getArtifactPayload(artifact: IArtifact): Promise<any>;

    /**
     * Execute context menu items one at a time: disallow other context menu items until prior one completed.
     *
     * @deprecated - This will be removed in a future release
     * @param cmdArgs the command arguments if any
     * @param callback  the code to call when cmd invoked, passing in the ArtifactTreeNode as a parameter
     */
    doContextMenuItem<T>(cmdArgs: any[], description: string, callback: (item: ArtifactTreeNode | undefined) => Promise<T>): Promise<boolean>;
}

/**
 * The filesystem provides a way for extensions to write files in consistent manner for all Fabric extensions.
 *
 * @deprecated
 * @remarks The filesystem  works with {@link Uri uris} and assumes hierarchical
 * paths, e.g. `foo:/my/path` is a child of `foo:/my/` and a parent of `foo:/my/path/deeper`.
 */
export interface ILocalFileSystem {
    /**
     * Creates a Fabric-specific Uri for the specified file path
     *
     * @param filePath - The full path for the filesystem entity to be created
     */
    createUri(filePath: string): vscode.Uri;

    /**
     * Write data to a file, replacing its entire contents.
     *
     * @param uri The uri of the file.
     * @param content The new content of the file.
     * @param options Defines if missing files should or must be created.
     */
    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void | Thenable<void>;
}

/**
 * Extension manager service for registering satellite extensions with the core Fabric extension.
 *
 * This interface provides the registration mechanism that allows satellite extensions to integrate
 * with the main Fabric extension. When a satellite extension activates, it uses this manager to
 * register itself and receive access to the core service collection.
 *
 * The manager also provides access to shared telemetry infrastructure and test hooks for
 * development and testing scenarios.
 *
 * @example
 * ```typescript
 * export function activate(context: vscode.ExtensionContext) {
 *   const manager: IFabricExtensionManager =
 *     vscode.extensions.getExtension('fabric.vscode-fabric')!.exports;
 *
 *   const services = manager.addExtension({
 *     // satellite extension implementation
 *   });
 * }
 * ```
 */
export interface IFabricExtensionManager {
    /**
     * Registers a satellite extension with the core Fabric extension.
     *
     * @param extension - The satellite extension implementation to register
     * @returns The service collection providing access to core Fabric services
     */
    addExtension(extension: IFabricExtension): IFabricExtensionServiceCollection;

    /**
     * Provides access to common telemetry properties shared across all extensions.
     *
     * @returns A function that returns a dictionary of telemetry properties that should
     *          be included in telemetry events sent by satellite extensions
     */
    getFunctionToFetchCommonTelemetryProperties(): () => { [key: string]: string };

    /**
     * Optional test hooks that are only available in test environments.
     *
     * These hooks provide access to internal state and functionality needed for
     * automated testing scenarios.
     */
    testHooks?: { [key: string]: any };
}

/**
 * Represents a Microsoft Fabric workspace as returned by the Fabric REST API.
 *
 * A workspace is a collaborative environment that contains Fabric artifacts (items) such as
 * notebooks, datasets, reports, and pipelines. Workspaces provide organizational structure,
 * access control, and resource management for Fabric content.
 *
 * This interface represents the workspace metadata including identification, display information,
 * capacity assignment, and optional source control integration for Git-based workflows.
 *
 * @see {@link https://learn.microsoft.com/en-us/fabric/get-started/workspaces Microsoft Fabric Workspaces Documentation}
 */
export interface IWorkspace {
    /**
     * Unique identifier for the workspace within Microsoft Fabric.
     * This GUID is used for all API operations targeting this workspace.
     */
    objectId: string;

    /**
     * Optional identifier of the Fabric capacity assigned to this workspace.
     */
    capacityId?: string;

    /**
     * The type identifier for the workspace.
     * Indicates the workspace category or configuration type within Fabric.
     */
    type: string;

    /**
     * Human-readable name for the workspace as displayed in the Fabric UI.
     * This is the name users see and use to identify the workspace.
     */
    displayName: string;

    /**
     * Description providing additional context about the workspace's purpose or content.
     * May be empty if no description was provided during workspace creation.
     */
    description: string;

    /**
     * Optional Git source control configuration for the workspace.
     * When present, indicates that the workspace is integrated with a Git repository
     * for version control and collaborative development workflows.
     */
    sourceControlInformation?: ISourceControlInformation;
}

export interface IWorkspaceFolder {
    id: string;
    displayName: string;
    workspaceId: string;
    parentFolderId?: string;
}

/**
 * Service for managing Fabric workspaces and their integration with the local development environment.
 *
 * This interface provides workspace lifecycle management and local file system integration capabilities.
 * It handles workspace discovery, creation, and the critical mapping between remote Fabric workspaces
 * and local folders for development workflows.
 *
 * The workspace manager also maintains connection state, provides tree view integration for the
 * VS Code sidebar, and handles authentication flows. It serves as the primary interface between
 * the Fabric cloud services and the local development environment.
 *
 * @example
 * ```typescript
 * // List available workspaces
 * const workspaces = await workspaceManager.listWorkspaces();
 *
 * // Get local folder for an item
 * const localFolder = await workspaceManager.getLocalFolderForArtifact(artifact, {
 *   createIfNotExists: true
 * });
 * ```
 */
export interface IWorkspaceManager {
    /**
     * Retrieves all Fabric workspaces accessible to the current user.
     * @returns Promise resolving to an array of workspace objects
     */
    listWorkspaces(): Promise<IWorkspace[]>;

    /**
     * Creates a new Fabric workspace with the specified name and options.
     * @param workspaceName - Display name for the new workspace
     * @param options - Optional configuration including capacity assignment and description
     * @returns Promise resolving to the API response for the workspace creation
     */
    createWorkspace(workspaceName: string, options?: { capacityId?: string, description?: string }): Promise<IApiClientResponse>;

    /**
     * Gets or creates the local folder mapped to a Fabric workspace.
     * @deprecated - Use getLocalFolderForArtifact
     * @param workspace - The Fabric workspace to get the local folder for
     * @param options - Options controlling folder creation behavior
     * @returns Promise resolving to the local folder URI, or undefined if not found/created
     */
    getLocalFolderForFabricWorkspace(workspace: IWorkspace, options?: { createIfNotExists?: boolean } | undefined): Promise<vscode.Uri | undefined>;

    /**
     * Gets the local folder associated with a specific artifact.
     *
     * This method retrieves the locally mapped folder for an artifact. When `createIfNotExists` is true,
     * the method will prompt the user to select a folder if no mapping exists, and will create the folder
     * on the file system if it doesn't exist.
     *
     * @param artifact - The Fabric artifact to get the local folder for
     * @param options - Optional configuration for folder retrieval and creation
     * @param options.createIfNotExists - When true, prompts the user to select a folder if no mapping exists
     *                                     and creates the folder on disk. When false or undefined, returns
     *                                     undefined if no existing mapping is found.
     * @returns Promise resolving to the artifact's local folder URI, or undefined if no mapping exists
     *          and `createIfNotExists` is false/undefined, or if the user cancels the folder selection prompt
     */
    getLocalFolderForArtifact(artifact: IArtifact, options?: { createIfNotExists?: boolean }): Promise<vscode.Uri | undefined>;

    /**
     * Event that fires when workspace-related property values change.
     * Allows subscribers to react to configuration or state changes.
     */
    get onDidChangePropertyValue(): vscode.Event<string>;

    /**
     * Retrieves all artifacts (items) within a specific workspace.
     * @param workspaceId - The unique identifier of the workspace
     * @returns Promise resolving to an array of artifacts in the workspace
     */
    getItemsInWorkspace(workspaceId: string): Promise<IArtifact[]>;

    /**
     * Retrieves all folders within a specific workspace.
     * @param workspaceId - The unique identifier of the workspace
     * @returns Promise resolving to an array of folders in the workspace
     */
    getFoldersInWorkspace(workspaceId: string): Promise<IWorkspaceFolder[]>;

    /**
     * Indicates whether an automatic login process is currently in progress.
     * Used to prevent concurrent authentication attempts.
     */
    isProcessingAutoLogin: boolean;

    /**
     * Current workspace context string indicating the active or selected workspace.
     * Used for UI state management and default workspace selection.
     */
    fabricWorkspaceContext: string;

    /**
     * Checks whether the extension is currently connected to Fabric services.
     * @returns Promise resolving to true if connected and authenticated, false otherwise
     */
    isConnected(): Promise<boolean>;

    /**
     * The VS Code tree view component for displaying Fabric workspace content.
     * May be undefined if the tree view is not currently active or available.
     */
    treeView: vscode.TreeView<FabricTreeNode> | undefined;

    /**
     * Clears any cached state from previous sessions.
     * Used during extension activation to ensure clean startup state.
     */
    clearPriorStateIfAny(): void;

    /**
     * Retrieves a specific workspace by its unique identifier.
     * @param workspaceId - The unique identifier of the workspace to retrieve
     * @returns Promise resolving to the workspace object, or undefined if not found
     */
    getWorkspaceById(workspaceId: string): Promise<IWorkspace | undefined>;
}

/**
 * Git source control configuration for integrating Fabric workspaces with external repositories.
 *
 * This interface defines the connection parameters needed to link a Fabric workspace with a Git
 * repository for version control workflows. When configured, it enables bi-directional sync
 * between Fabric workspace content and Git repository content.
 *
 * The configuration supports specifying the target branch, repository URL, and workspace location
 * within the repository structure, allowing for flexible repository organization patterns.
 *
 * @see {@link https://learn.microsoft.com/en-us/fabric/cicd/git-integration/intro-to-git-integration Fabric Git Integration}
 */
export interface ISourceControlInformation {
    /**
     * The name of the branch to clone; if not specified, the default branch will be cloned
     */
    branchName?: string;

    /**
     * The URL of the git repository
     */
    repository?: string;

    /**
     * The relative path to the workspace root within the repository
     */
    directoryName?: string;
}
