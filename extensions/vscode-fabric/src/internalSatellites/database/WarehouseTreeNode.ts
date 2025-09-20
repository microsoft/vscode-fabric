import * as vscode from 'vscode';
import { IApiClientRequestOptions, IApiClientResponse, IArtifact, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { SqlDatabaseApiResponse } from './ApiResponseModels';

/**
 * WarehouseTreeNode
 * Mirrors SqlDatabaseTreeNode behavior. Assumes warehouse GET endpoint returns the
 * same payload contract as SQL database:
 * {
 *   properties: {
 *     connectionString: string;
 *     serverFqdn: string;
 *     databaseName: string;
 *   }, ...
 * }
 *
 * If backend contract diverges later, introduce a dedicated interface instead of reusing SqlDatabaseApiResponse.
 */
export class WarehouseTreeNode extends AbstractDatabaseTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);
        this.contextValue += '|item-open-in-sql|item-copy-connection-string';
    }

    protected artifactType: 'Warehouse' = 'Warehouse';

    private async callApi(apiClient: IFabricApiClient, workspaceId: string): Promise<SqlDatabaseApiResponse> {
        const apiRequestOptions: IApiClientRequestOptions = {
            // Assumption: warehouses collection path
            pathTemplate: `/v1/workspaces/${workspaceId}/warehouses/${this.artifact.id}`,
            method: 'GET',
        };
        const response: IApiClientResponse = await apiClient.sendRequest(apiRequestOptions);
        this.validateResponse(response);
        return response.parsedBody as SqlDatabaseApiResponse;
    }

    public async getConnectionString(apiClient: IFabricApiClient): Promise<string> {
        const warehouseData = await this.callApi(apiClient, this.artifact.workspaceId);
        return warehouseData.properties.connectionString;
    }

    public async getExternalUri(apiClient: IFabricApiClient): Promise<string> {
        const warehouseData = await this.callApi(apiClient, this.artifact.workspaceId);
        const serverName = warehouseData.properties.connectionString;
        const databaseName = warehouseData.displayName;
        return this.constructExternalUri(serverName, databaseName);
    }
}
