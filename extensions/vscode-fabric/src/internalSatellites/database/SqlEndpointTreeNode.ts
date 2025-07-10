import * as vscode from 'vscode';
import { IApiClientRequestOptions, IApiClientResponse, IArtifact, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { SqlEndpontGetConnectionStringResponse } from './ApiResponseModels';

export class SqlEndpointTreeNode extends AbstractDatabaseTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);

        this.contextValue += '|item-open-in-sql|item-copy-connection-string';
    }

    protected artifactType: 'SQLEndpoint' = 'SQLEndpoint';

    private async callApi(apiClient: IFabricApiClient, workspaceId: string): Promise<SqlEndpontGetConnectionStringResponse> {
        const apiRequestOptions: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${workspaceId}/sqlEndpoints/${this.artifact.id}/connectionString`,
            method: 'GET',
        };
        const response: IApiClientResponse = await apiClient.sendRequest(apiRequestOptions);
        this.validateResponse(response);
        return response.parsedBody as SqlEndpontGetConnectionStringResponse;
    }

    public async getConnectionString(apiClient: IFabricApiClient): Promise<string> {
        const sqlEndpontConnectionStringResponse = await this.callApi(apiClient, this.artifact.workspaceId);
        return sqlEndpontConnectionStringResponse.connectionString;
    }

    public async getExternalUri(apiClient: IFabricApiClient): Promise<string> {
        const connectionString = await this.getConnectionString(apiClient);

        // appears connectionString is treated as serverName in this case
        const externalUri = this.constructExternalUri(connectionString);
        return externalUri;
    }
}