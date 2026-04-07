// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IApiClientResponse, IArtifact, IItemDefinition, IWorkspace, IApiClientRequestOptions, IFabricApiClient, IArtifactHandler, IArtifactManager, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { FabricError, IFabricEnvironmentProvider, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { handleLongRunningOperation } from '../utilities';
import { formatErrorResponse } from '../utilities';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

export class ArtifactManager implements IArtifactManager {
    protected disposables: vscode.Disposable[] = [];

    constructor(protected extensionManager: IFabricExtensionManagerInternal,
        protected workspaceManager: IWorkspaceManager,
        protected workspaceFilterManager: IWorkspaceFilterManager,
        protected fabricEnvironmentProvider: IFabricEnvironmentProvider,
        protected apiClient: IFabricApiClient,
        protected logger: ILogger,
        protected telemetryService: TelemetryService | null = null, // base class (for MockArtifactManager) can be null, but required for ArtifactManager Class
        protected dataProvider: FabricWorkspaceDataProvider
    ) {
    }

    protected getArtifactHandler(artifact: IArtifact): IArtifactHandler | undefined {
        return this.extensionManager.artifactHandlers.get(artifact.type);
    }

    public dispose(): void {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    public async createArtifact(artifact: IArtifact, itemSpecificMetadata: any | undefined): Promise<IApiClientResponse> {
        const requestBody: Record<string, any> = {
            displayName: artifact.displayName,
            description: artifact.description,
            type: artifact.type,
        };

        // Include folderId if artifact should be created in a folder
        if (artifact.folderId) {
            requestBody.folderId = artifact.folderId;
        }

        const request: IApiClientRequestOptions =
        {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
            body: requestBody,
        };

        // Get the custom Artifact Handler to delegate any custom CRUD operations
        const artifactHandler = this.extensionManager.getArtifactHandler(artifact.type);
        if (artifactHandler?.createWorkflow?.onBeforeCreate) {
            await artifactHandler.createWorkflow.onBeforeCreate(artifact, request, itemSpecificMetadata);
        }

        const response = await this.apiClient.sendRequest(request); // returns 202 Accepted if successful

        if (artifactHandler?.createWorkflow?.onAfterCreate) {
            await artifactHandler.createWorkflow.onAfterCreate(artifact, itemSpecificMetadata, response);
        }

        return response;
    }

    public async createArtifactWithDefinition(
        artifact: IArtifact,
        definition: IItemDefinition,
        folder: vscode.Uri,
        options?: { progress?: vscode.Progress<{ message?: string; increment?: number }> }
    ): Promise<IApiClientResponse> {
        let apiRequestOptions: IApiClientRequestOptions = {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: {
                displayName: artifact.displayName,
                description: artifact.description,
                type: artifact.type,
                definition,
                ...(artifact.folderId ? { folderId: artifact.folderId } : {}),
            },
        };

        const artifactHandler = this.getArtifactHandler(artifact);

        // Allow handler to customize request before sending create-with-definition
        if (artifactHandler?.createWithDefinitionWorkflow?.onBeforeCreateWithDefinition) {
            apiRequestOptions = await artifactHandler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(
                artifact,
                definition,
                folder,
                apiRequestOptions
            );
        }

        const response = await this.apiClient.sendRequest(apiRequestOptions);
        const finalResponse = await handleLongRunningOperation(this.apiClient, response, this.logger, options?.progress);

        if (artifactHandler?.createWithDefinitionWorkflow?.onAfterCreateWithDefinition) {
            await artifactHandler.createWithDefinitionWorkflow.onAfterCreateWithDefinition(
                artifact,
                definition,
                folder,
                finalResponse
            );
        }
        return finalResponse;
    }

    public async getArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        // If the handler has a readWorkflow with onBeforeRead, call it before sending the request
        const pathTemplate = `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`;
        let options: IApiClientRequestOptions = {
            method: 'GET',
            pathTemplate: pathTemplate,
        };

        // Get the custom Artifact Handler to delegate any custom CRUD operations
        const artifactHandler = this.extensionManager.getArtifactHandler(artifact.type);
        if (artifactHandler?.readWorkflow?.onBeforeRead) {
            options = await artifactHandler.readWorkflow.onBeforeRead(artifact, options);
        }

        return await this.apiClient.sendRequest(options);
    }

    public async listArtifacts(workspace: IWorkspace): Promise<IArtifact[]> {
        const options: IApiClientRequestOptions = {
            method: 'GET',
            pathTemplate: `/v1/workspaces/${workspace.objectId}/items`,
        };

        const response = await this.apiClient.sendRequest(options);
        if (response.status !== 200) {
            throw new FabricError(
                formatErrorResponse(vscode.l10n.t('Error listing items for workspace {0}', workspace.displayName), response),
                response.parsedBody?.errorCode || 'Error listing items'
            );
        }

        let artifacts: IArtifact[] = [];
        if (response.parsedBody.value) {
            artifacts = response.parsedBody.value;
        }

        // loop through all the artifacts and set artifact.fabricEnvironment to the current fabric environment
        artifacts.forEach((artifact) => {
            artifact.fabricEnvironment = this.fabricEnvironmentProvider.getCurrent().env;
        });

        return artifacts;
    }

    public async updateArtifact(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse> {
        let options: IApiClientRequestOptions =
        {
            method: 'PATCH',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: Object.fromEntries(body),
        };

        const artifactHandler = this.getArtifactHandler(artifact);
        const newName = body.get('displayName');
        if (newName && artifactHandler?.renameWorkflow?.onBeforeRename) {
            options = await artifactHandler.renameWorkflow.onBeforeRename(artifact, newName, options);
        }

        const response = await this.apiClient.sendRequest(options);

        if (newName && artifactHandler?.renameWorkflow?.onAfterRename) {
            await artifactHandler.renameWorkflow.onAfterRename(artifact, newName, response);
        }
        return response;
    }

    public async deleteArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        let options: IApiClientRequestOptions =
        {
            method: 'DELETE',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`,
        };

        const artifactHandler = this.getArtifactHandler(artifact);
        if (artifactHandler?.deleteWorkflow?.onBeforeDelete) {
            options = await artifactHandler.deleteWorkflow.onBeforeDelete(artifact, options);
        }

        const response = await this.apiClient.sendRequest(options);

        if (artifactHandler?.deleteWorkflow?.onAfterDelete) {
            await artifactHandler.deleteWorkflow.onAfterDelete(artifact, response);
        }
        return response;
    }

    public async getArtifactDefinition(
        artifact: IArtifact,
        folder?: vscode.Uri,
        options?: { progress?: vscode.Progress<{ message?: string; increment?: number }> }
    ): Promise<IApiClientResponse> {
        let apiRequestOptions: IApiClientRequestOptions =
        {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}/getDefinition`,
        };

        const artifactHandler = this.getArtifactHandler(artifact);
        if (artifactHandler?.getDefinitionWorkflow?.onBeforeGetDefinition) {
            apiRequestOptions = await artifactHandler.getDefinitionWorkflow.onBeforeGetDefinition(artifact, folder, apiRequestOptions);
        }

        const response = await this.apiClient.sendRequest(apiRequestOptions);
        const finalResponse = await handleLongRunningOperation(this.apiClient, response, this.logger, options?.progress);

        if (artifactHandler?.getDefinitionWorkflow?.onAfterGetDefinition) {
            await artifactHandler.getDefinitionWorkflow.onAfterGetDefinition(artifact, folder, finalResponse);
        }
        return finalResponse;
    }

    public async updateArtifactDefinition(
        artifact: IArtifact,
        definition: IItemDefinition,
        folder: vscode.Uri,
        options?: { progress?: vscode.Progress<{ message?: string; increment?: number }> }
    ): Promise<IApiClientResponse> {
        let apiRequestOptions: IApiClientRequestOptions =
        {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}/updateDefinition`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: { definition },
        };

        const artifactHandler = this.getArtifactHandler(artifact);
        // Allow handler to customize request before sending update definition
        if (artifactHandler?.updateDefinitionWorkflow?.onBeforeUpdateDefinition) {
            apiRequestOptions = await artifactHandler.updateDefinitionWorkflow.onBeforeUpdateDefinition(
                artifact,
                definition,
                folder,
                apiRequestOptions
            );
        }

        const response = await this.apiClient.sendRequest(apiRequestOptions);
        const finalResponse = await handleLongRunningOperation(this.apiClient, response, this.logger, options?.progress);

        if (artifactHandler?.updateDefinitionWorkflow?.onAfterUpdateDefinition) {
            await artifactHandler.updateDefinitionWorkflow.onAfterUpdateDefinition(
                artifact,
                definition,
                folder,
                finalResponse
            );
        }
        return finalResponse;
    }

}
