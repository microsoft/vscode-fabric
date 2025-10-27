// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IArtifact, IFabricApiClient, IApiClientRequestOptions, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { SqlDatabaseApiResponse } from './ApiResponseModels';

export class SqlDatabaseTreeNode extends AbstractDatabaseTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);
        this.contextValue += '|item-open-in-sql|item-copy-connection-string';
    }

    protected artifactType: 'SQLDatabase' = 'SQLDatabase';

    private async callApi(apiClient: IFabricApiClient, workspaceId: string): Promise<SqlDatabaseApiResponse> {
        const apiRequestOptions: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${workspaceId}/sqlDatabases/${this.artifact.id}`,
            method: 'GET',
        };
        const response: IApiClientResponse = await apiClient.sendRequest(apiRequestOptions);
        this.validateResponse(response);
        return response.parsedBody as SqlDatabaseApiResponse;
    }

    public async getConnectionString(apiClient: IFabricApiClient): Promise<string> {
        const databaseData = await this.callApi(apiClient, this.artifact.workspaceId);
        return databaseData.properties.connectionString;
    }

    public async getExternalUri(apiClient: IFabricApiClient): Promise<string> {
        const databaseData = await this.callApi(apiClient, this.artifact.workspaceId);

        const serverName = databaseData.properties.serverFqdn.split(',')[0];
        const databaseName = databaseData.properties.databaseName;

        const targetUrl = this.constructExternalUri(serverName, databaseName);

        return targetUrl;
    }
}
