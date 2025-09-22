import * as vscode from 'vscode';

import { ArtifactTreeNode, IApiClientResponse, IArtifact, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { FabricError } from '@microsoft/vscode-fabric-util';

export type SqlArtifactType = 'SQLDatabase' | 'SQLEndpoint' | 'Warehouse';

export abstract class AbstractDatabaseTreeNode extends ArtifactTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);
    }
    protected abstract artifactType: SqlArtifactType;

    /* eslint-disable @typescript-eslint/naming-convention */
    protected readonly typeDisplayNameMap: { [key in SqlArtifactType]: string } = {
        SQLDatabase: 'SQL Database',
        SQLEndpoint: 'SQL Analytics Endpoint',
        Warehouse: 'Warehouse',
    };

    protected validateResponse(response: IApiClientResponse): void {
        if (response.status !== 200) {
            throw new FabricError(
                vscode.l10n.t('API call failed for {0}. Status: {1}, Error Code: {2}, Error Message: {3}', this.artifactType, response.status, response.parsedBody?.errorCode, response.parsedBody?.message),
                `API call failed for ${this.artifactType}`,
                { showInFabricLog: true, showInUserNotification: 'Error' }
            );
        }
    }

    protected constructExternalUri(serverName: string, databaseName: string | undefined = undefined): string {
        const profileName = `${this.artifact.displayName} (${this.typeDisplayNameMap[this.artifactType]})`;

        //note the parmeters do not need to be encoded as they are handled by the mssql extension
        var base = `${vscode.env.uriScheme}://ms-mssql.mssql/connect?server=${serverName}&authenticationType=AzureMFA&profileName=${profileName}`;
        if (databaseName) {
            base += `&database=${databaseName}`;
        }
        return base;
    }

    public abstract getConnectionString(apiClient: IFabricApiClient): Promise<string>;
    public abstract getExternalUri(apiClient: IFabricApiClient): Promise<string>;

}
