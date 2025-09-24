// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse, IArtifact, IArtifactHandler, IArtifactManager, IFabricExtensionManager, IFabricExtensionServiceCollection, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, OperationRequestType } from '@microsoft/vscode-fabric-api';
import { IObservableReadOnlyMap } from '../../collections/definitions';

/**
 * Performs git commands.
 * This interface should handle all error messaging and logging.
 */
export interface IGitOperator {
    /**
     * Clones the specified repository to the specified destination
     * @param url - The URL of the repository to clone
     * @param destinationPath - The path to which the repository should be cloned
     * @param branchName - The name of the branch to clone; if not specified, the default branch will be cloned
     * @returns The root of the cloned directory; undefined if the clone operation fails
     */
    cloneRepository(url: string, destinationPath: vscode.Uri, branchName?: string): Promise<vscode.Uri | undefined>;
}

/**
 * Exposes components of the Fabric Extension Manager that are not required for satellite extensions
 */
export interface IFabricExtensionManagerInternal extends IFabricExtensionManager {
    /**
     * Fetches the artifact handler for the specified artifact type
     * @param artifactType - The type of artifact for which to get the handler
     * @return The artifact handler for the artifact type, or undefined if no handler is available
     */
    getArtifactHandler(artifactType: string): IArtifactHandler | undefined;

    /**
     * The collection of {@link IArtifactHandler}s provided by all satellite extensions
     */
    get artifactHandlers(): IObservableReadOnlyMap<string, IArtifactHandler>;

    /**
     * The collection of {@link IFabricTreeNodeProvider}s provided by all satellite extensions
     */
    get treeNodeProviders(): IObservableReadOnlyMap<string, IFabricTreeNodeProvider>;

    /**
     * The collection of {@link ILocalProjectTreeNodeProvider}s provided by all satellite extensions
     */
    get localProjectTreeNodeProviders(): IObservableReadOnlyMap<string, ILocalProjectTreeNodeProvider>;

    /**
     * Determines if the specified extension is installed and available
     * @param extensionId - The identifier of the extension to check
     */
    isAvailable(extensionId: string): boolean;

    /**
     * The service collection {@link IFabricExtensionServiceCollection}s to provide to satellite extensions
     */
    set serviceCollection(value: IFabricExtensionServiceCollection);

    /**
     * An event to signal that the satellite extensions have been updated
     */
    onExtensionsUpdated: vscode.Event<void>;
}

export interface IArtifactManagerInternal extends IArtifactManager {
    /**
     * Determines if a deprecated command should be used for the given artifact type and operation request type
     * @param artifactType - The type of the artifact
     * @param operationRequestType - The type of the operation request
     */
    shouldUseDeprecatedCommand(artifactType: string, operationRequestType: OperationRequestType): boolean;

    /**
     * Creates a new artifact using deprecated API
     * @deprecated This method is deprecated and should not be used in new code
     * @param artifact - The artifact to create
     */
    createArtifactDeprecated(artifact: IArtifact): Promise<IApiClientResponse>;

    /**
     * Updates an existing artifact
     * @deprecated This method is deprecated and should not be used in new code
     * @param artifact - The artifact to update
     * @param body - The update data
     * @returns The response from the API
     */
    updateArtifactDeprecated(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse>;
}
