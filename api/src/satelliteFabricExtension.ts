// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { IArtifact, IApiClientRequestOptions, IApiClientResponse, IItemDefinition } from './FabricApiClient';
import { OperationRequestType, IOpenArtifactOptions } from './fabricExtension';
import { ArtifactTreeNode, LocalProjectTreeNode } from './treeView';

/**
 * Encapsulates the functionality provided by a satellite extension
 */
export interface IFabricExtension {
    /**
     * The identity of this satellite extension
     */
    identity: string;

    /**
     * The version of the Fabric API this extension is compatible with. Should be passed as '<major>.<minor>'
     */
    apiVersion: string;

    /**
     * The collection of artifact types for which this extension provides custom functionality
     */
    artifactTypes: string[];

    /**
     * The collection of {@link IArtifactHandler}s provided by this extension
     */
    artifactHandlers?: IArtifactHandler[];

    /**
     * The collection of {@link IFabricTreeNodeProvider}s provided by this extension
     */
    treeNodeProviders?: IFabricTreeNodeProvider[];

    /**
     * The collection of {@link ILocalProjectTreeNodeProvider}s provided by this extension
     */
    localProjectTreeNodeProviders?: ILocalProjectTreeNodeProvider[];
}

/**
 * Allows the satellite extension to perform specific actions on an artifact
 */
export interface IArtifactHandler {
    /**
     * The type of artifact this handler provides functionality for
     */
    artifactType: string;

    /**
     * Allows the artifact handler to customize the request prior to it being sent to the Fabric endpoint
     *
     * @deprecated - Use appropriate workflows instead
     *
     * @param action - Indicate what kind of {@link OperationRequestType} is about to be made
     * @param artifact - The {@link IArtifact} that will be operated upon
     * @param request - The {@link IApiClientRequestOptions} that will be sent
     */
    onBeforeRequest?(action: OperationRequestType, artifact: IArtifact, request: IApiClientRequestOptions): Promise<void>;

    /**
     * Allows the artifact handler to enhance the response after it has been received from the Fabric endpoint
     *
     * @deprecated - Use appropriate workflows instead
     *
     * @param action - Indicate what kind of {@link OperationRequestType} was made
     * @param artifact - The {@link IArtifact} that was operated upon
     * @param request - The {@link IApiClientResponse} returned by the API
     */
    onAfterRequest?(action: OperationRequestType, artifact: IArtifact, response: IApiClientResponse): Promise<void>;

    /**
     * Allows the artifact handler to open a specific artifact from Fabric
     *
     * @deprecated - Use getDefinitionWorkflow instead
     *
     * @param artifact - The {@link IArtifact} to be opened
     * @param openOptions - Additional options for opening an artifact
     * @returns - A boolean indicating whether the artifact was opened successfully
     */
    onOpen?(artifact: IArtifact, openOptions?: IOpenArtifactOptions): Promise<boolean>;

    /**
     * Provides the creation experience for this artifact type.
     */
    createWorkflow?: ICreateArtifactWorkflow;

    /**
     * Provides the read experience for this artifact type.
     */
    readWorkflow?: IReadArtifactWorkflow;

    /**
     * Provides the get definition experience for this artifact type.
     */
    getDefinitionWorkflow?: IGetArtifactDefinitionWorkflow;

    /**
     * Provides the update definition experience for this artifact type.
     */
    updateDefinitionWorkflow?: IUpdateArtifactDefinitionWorkflow;

    /**
     * Provides the create-with-definition experience for this artifact type. This allows creating
     * a new artifact while supplying its initial definition (similar to updateDefinitionWorkflow but
     * for creation scenarios).
     */
    createWithDefinitionWorkflow?: ICreateArtifactWithDefinitionWorkflow;

    /**
     * Provides the delete experience for this artifact type.
     */
    deleteWorkflow?: IDeleteArtifactWorkflow;

    /**
     * Provides the rename experience for this artifact type.
     */
    renameWorkflow?: IRenameArtifactWorkflow;
}

/**
 * Combines the UI and pre-request customization for artifact creation.
 * This interface allows a handler to provide both a UI for gathering additional creation info
 * and to customize the artifact and request before sending to the Fabric endpoint.
 */
export interface ICreateArtifactWorkflow {
    /**
     * Shows UI to gather additional information if this is the item type being created.
     * Returns metadata or undefined if creation is cancelled.
     */
    showCreate(artifact: IArtifact): Promise<any | undefined>;

    /**
     * Allows customization of the artifact before the request is sent.
     * Returns a possibly modified artifact or undefined to cancel
     *
     * @param artifact - The artifact to create
     * @param customItemMetadata - The metadata returned from the UI
     * @param request - The request options
     * @returns - A possibly modified artifact or undefined to cancel
     */
    onBeforeCreate?(artifact: IArtifact, customItemMetadata: any | undefined, request: IApiClientRequestOptions): Promise<IArtifact | undefined>;

    /**
     * Allows customization of the response after the request is completed.
     * This can be used to handle any post-creation logic or cleanup
     *
     * @param artifact - The artifact that was created
     * @param customItemMetadata - The metadata returned from the UI
     * @param response - The response from the API
     */
    onAfterCreate?(artifact: IArtifact, customItemMetadata: any | undefined, response: IApiClientResponse): Promise<void>;
}

/**
 * This interface allows a handler to provide pre-request customization for reading an artifact.
 */
export interface IReadArtifactWorkflow {
    /**
     * Allows customization of the API request before it is sent
     * @param artifact The artifact to read
     * @param options The request options
     */
    onBeforeRead?(artifact: IArtifact, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;
}

/**
 * Provides customization for artifact definition retrieval operations.
 * This interface allows a handler to customize the request and response handling
 * when getting an artifact's definition from the Fabric endpoint.
 */
export interface IGetArtifactDefinitionWorkflow {
    /**
     * Allows customization of the API request before it is sent to get the artifact definition
     * @param artifact The artifact whose definition is being retrieved
     * @param folder The local folder where the definition will be stored (optional - undefined for remote view scenarios)
     * @param options The request options that can be modified
     * @returns Modified request options
     */
    onBeforeGetDefinition?(artifact: IArtifact, folder: vscode.Uri | undefined, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;

    /**
     * Allows post-processing after the definition has been retrieved
     * @param artifact The artifact whose definition was retrieved
     * @param folder The local folder where the definition was stored (optional - undefined for remote view scenarios)
     * @param response The response from the API containing the definition
     */
    onAfterGetDefinition?(artifact: IArtifact, folder: vscode.Uri | undefined, response: IApiClientResponse): Promise<void>;
}

/**
 * Provides customization for artifact definition update operations.
 * Handlers can gather any required user input and customize the request in
 * `onBeforeUpdateDefinition`, and handle post-update logic in `onAfterUpdateDefinition`.
 */
export interface IUpdateArtifactDefinitionWorkflow {
    /**
     * Allows pre-processing before invoking the update definition operation.
     * Provides a means to stipulate which files should be included in the update.
     *
     * @param artifact The artifact whose definition is being updated
     * @param folder The local folder containing the artifact
     * @returns An array of file paths (relative to the folder) to include in the update, or undefined if the update should be canceled
     */
    prepareForUpdateWithDefinition?(artifact: IArtifact, folder: vscode.Uri): Promise<string[] | undefined>;

    /**
     * Allows customization of the API request before it is sent to update the definition
     * @param artifact The artifact whose definition is being updated
     * @param definition The definition to be updated
     * @param folder The local folder containing the artifact
     * @param options The request options that can be modified
     * @returns Modified request options
     */
    onBeforeUpdateDefinition?(artifact: IArtifact, definition: IItemDefinition, folder: vscode.Uri, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;

    /**
     * Allows post-processing after the definition has been updated
     * @param artifact The artifact whose definition was updated
     * @param definition The definition that was updated
     * @param folder The local folder containing the artifact
     * @param response The response from the API
     */
    onAfterUpdateDefinition?(artifact: IArtifact, definition: IItemDefinition, folder: vscode.Uri, response: IApiClientResponse): Promise<void>;
}

/**
 * Provides customization for artifact definition creation operations where an artifact is created
 * alongside an explicit definition. Handlers can gather any required user input and customize the
 * request in `onBeforeCreateWithDefinition`, and handle post-create logic in `onAfterCreateWithDefinition`.
 */
export interface ICreateArtifactWithDefinitionWorkflow {
    /**
     * Allows pre-processing before invoking the create artifact with definition operation.
     * Provides a means to stipulate which files should be included in the creation.
     *
     * @param artifact The artifact whose definition is being created
     * @param folder The local folder containing the artifact
     * @returns An array of file paths (relative to the folder) to include in the creation, or undefined if the creation should be canceled
     */
    prepareForCreateWithDefinition?(artifact: IArtifact, folder: vscode.Uri): Promise<string[] | undefined>;

    /**
     * Allows customization of the API request before it is sent to create the artifact with its definition
     * @param artifact The artifact being created
     * @param definition The initial definition for the artifact
     * @param folder The local folder containing (or to contain) the artifact
     * @param options The request options that can be modified
     * @returns Modified request options
     */
    onBeforeCreateWithDefinition?(artifact: IArtifact, definition: IItemDefinition, folder: vscode.Uri, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;

    /**
     * Allows post-processing after the artifact with definition has been created
     * @param artifact The artifact that was created
     * @param definition The definition that was created with the artifact
     * @param folder The local folder containing the artifact
     * @param response The response from the API
     */
    onAfterCreateWithDefinition?(artifact: IArtifact, definition: IItemDefinition, folder: vscode.Uri, response: IApiClientResponse): Promise<void>;
}

/**
 * Provides customization for artifact deletion operations.
 * This interface allows a handler to customize the request and handle post-deletion logic.
 */
export interface IDeleteArtifactWorkflow {
    /**
     * Allows customization of the API request before it is sent to delete the artifact
     * @param artifact The artifact being deleted
     * @param options The request options that can be modified
     * @returns Modified request options
     */
    onBeforeDelete?(artifact: IArtifact, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;

    /**
     * Allows post-processing after the artifact has been deleted
     * @param artifact The artifact that was deleted
     * @param response The response from the API
     */
    onAfterDelete?(artifact: IArtifact, response: IApiClientResponse): Promise<void>;
}

/**
 * Provides customization for artifact rename operations.
 * This interface allows a handler to customize the request and handle post-rename logic.
 */
export interface IRenameArtifactWorkflow {
    /**
     * Allows customization of the API request before it is sent to rename the artifact
     * @param artifact The artifact being renamed
     * @param newName The new name for the artifact
     * @param options The request options that can be modified
     * @returns Modified request options
     */
    onBeforeRename?(artifact: IArtifact, newName: string, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;

    /**
     * Allows post-processing after the artifact has been renamed
     * @param artifact The artifact that was renamed
     * @param newName The new name that was applied
     * @param response The response from the API
     */
    onAfterRename?(artifact: IArtifact, newName: string, response: IApiClientResponse): Promise<void>;
}

/**
 * Flags describing which actions are allowed againt the artifact type.
 */
export enum ArtifactDesignerActions {
    none = 0,
    delete = 1 << 0,
    rename = 1 << 1,
    viewInPortal = 1 << 2,
    default = ~(~0 << 3),
    /** @deprecated - Use openLocalFolder instead */
    open = 1 << 3,
    /** @deprecated - Use definition instead */
    publish = 1 << 4,
    definition = 1 << 5,
    openLocalFolder = 1 << 6,
}

/**
 * Flags describing which actions are allowed agains the local project node.
 */
export enum LocalProjectDesignerActions {
    none = 0,
    default = 0,
    definition = 1 << 5,
}

/**
 * Allows the satellite extension to define item-specific nodes to show in the remote workspace tree view.
 * If a satellite extension does not supply a provider, a default node will be created instead; see {@link ArtifactTreeNode}.
 */
export interface IFabricTreeNodeProvider {
    /**
     * The type of artifact this provider can create nodes for
     */
    artifactType: string;

    /**
     * Creates a tree node for the specified artifact
     * @param artifact - The {@link IArtifact} to create a node for
     * @returns - A customized (@link ArtifactTreeNode}
     */
    createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode>;
}

/**
 * Allows the satellite extension to define item-specific nodes to show in the local project tree view.
 */
export interface ILocalProjectTreeNodeProvider {
    /**
     * The type of artifact this provider can create nodes for
     */
    artifactType: string;

    /**
     * Creates a tree node for the specified path
     * @param path - The candidate path for a local project corresponding to the artifact type of this provider
     * @returns - A customized (@link LocalProjectTreeNode}. Returns undefined if the path is not a valid local project
     */
    createLocalProjectTreeNode(path: Uri): Promise<LocalProjectTreeNode | undefined>;
}
