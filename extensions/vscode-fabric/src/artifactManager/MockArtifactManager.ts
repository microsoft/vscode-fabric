/* eslint-disable security/detect-object-injection */
import * as vscode from 'vscode';

import { IArtifact, IArtifactHandler, IApiClientRequestOptions, IApiClientResponse, OperationRequestType, IOpenArtifactOptions, Schema, IFabricApiClient, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { ArtifactManager } from './ArtifactManager';
import { MockWorkspaceManager } from '../workspace/mockWorkspaceManager';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { IFabricEnvironmentProvider, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

export class MockArtifactManager extends ArtifactManager {
    public mapArtifacts: Map<string, IArtifact[]> = new Map<string, IArtifact[]>(); // wspaceid 

    constructor(
        extensionManager: IFabricExtensionManagerInternal,
        workspaceManager: IWorkspaceManager,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        apiClient: IFabricApiClient,
        logger: ILogger,
        telemetrySevice: TelemetryService | null,
        dataProvider: FabricWorkspaceDataProvider) {
        super(extensionManager, workspaceManager, fabricEnvironmentProvider, apiClient, logger, telemetrySevice, dataProvider);
    }

    /**
     * Returns the artifacts for the current workspace
     */
    public get artifacts(): IArtifact[] {
        const arts = (this.workspaceManager! as MockWorkspaceManager).getArtifacts();
        return arts;
    };

    async createArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        artifact.id = String(this.artifacts.length);
        (this.workspaceManager! as MockWorkspaceManager).addArtifact(artifact);
        this.dataProvider.refresh();
        return Promise.resolve({
            status: 200
        });
    }

    async selectArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        let request: IApiClientRequestOptions = {
            method: 'GET',
            pathTemplate: '/metadata/artifacts/' + artifact.id,
        };

        const artifactHandler: IArtifactHandler | undefined = this.getArtifactHandler(artifact);
        if (artifactHandler?.onBeforeRequest) {
            await artifactHandler?.onBeforeRequest(OperationRequestType.select, artifact, request);
        }

        let response: IApiClientResponse = {
            status: 200,
            bodyAsText: `{"sometext": "some mock test text for artifact ${artifact.type}"}`
        };

        if (artifactHandler?.onAfterRequest) {
            await artifactHandler?.onAfterRequest(OperationRequestType.select, artifact, response);
        }
        if (response.bodyAsText) {
            const query = '?content=' + encodeURIComponent(response.bodyAsText);
            const furi = vscode.Uri.parse(
                Schema.fabricVirtualDoc + ':/'
                + artifact.displayName + '.json' + query);
            const doc = await vscode.workspace.openTextDocument(furi);
            await vscode.window.showTextDocument(doc);
        }

        return response;
    }
    async getArtifactData(artifact: IArtifact): Promise<IApiClientResponse> {
        let pathTemplate = `/v1/workspaces/${artifact.workspaceId}/userdatafunctions/${artifact.id}/__private/functions/metadata`;
        const options: IApiClientRequestOptions =
        {
            method: 'GET',
            pathTemplate: pathTemplate
        };
        const response = await this.apiClient.sendRequest(options);
        if (response?.status !== 200) {
            throw new Error(
                vscode.l10n.t('Error getting Artifact data for \'{0}\' Status = {1} {2}', artifact.displayName, response.status, response.response?.bodyAsText ?? ''));
        }
        return response;
    }

    async updateArtifact(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse> {
        const index = this.artifacts.findIndex((item) => item.id === artifact.id);
        if (index > -1) {
            const artifact = this.artifacts[index];
            let request: IApiClientRequestOptions = {
                method: 'PATCH',
                pathTemplate: '/metadata/artifacts/' + artifact.id,
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Content-Type': 'application/json',
                },
                body: {
                    displayName: artifact.displayName,
                    description: artifact.description + ' Updated Artifact ' + Date(), // make a change so we can tell it changed
                }
            };
            artifact.description += ' Updated Artifact' + Date();

            const artifactHandler: IArtifactHandler | undefined = this.getArtifactHandler(artifact);
            if (artifactHandler?.onBeforeRequest) {
                await artifactHandler?.onBeforeRequest(OperationRequestType.update, artifact, request);
            }
            const response = await this.apiClient.sendRequest(request);

            if (artifactHandler?.onAfterRequest) {
                await artifactHandler?.onAfterRequest(OperationRequestType.update, artifact, response!);
            }

            this.dataProvider.refresh(); // force an update to the tree
            if (response?.status !== 200) {
                return Promise.reject('failed to update ' + response?.status);
            }
            return Promise.resolve(response!);
        }
        return Promise.reject('Artifact not found');
    }

    async deleteArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        const index = this.artifacts.findIndex((item) => item.id === artifact.id);
        if (index > -1) {
            this.artifacts.splice(index, 1);
        }
        this.dataProvider.refresh();
        return Promise.resolve({
            status: 200
        });
    }

    async openArtifact(artifact: IArtifact, openOptions?: IOpenArtifactOptions): Promise<void> {
        const artifactHandler: IArtifactHandler | undefined = this.getArtifactHandler(artifact);
        if (artifactHandler?.onOpen) {
            await artifactHandler?.onOpen(artifact, openOptions);
        }
    }

    async getArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        return Promise.resolve({
            status: 200,
            bodyAsText: `{"sometext": "some mock test text for artifact ${artifact.type}"}`
        });
    }
}
