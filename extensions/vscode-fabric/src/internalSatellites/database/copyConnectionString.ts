import * as vscode from 'vscode';

import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { TelemetryEvent, ArtifactPropertyNames, TelemetryService } from '@fabric/vscode-fabric-util';
import { IFabricApiClient, IWorkspaceManager } from '@fabric/vscode-fabric-api';

/* eslint-disable @typescript-eslint/naming-convention */
type TelemetryEventNames = {
    'item/copy/connection-string': { properties: ArtifactPropertyNames; measurements: never }
};

export async function copyConnectionStringToClipboard(
    telemetryService: TelemetryService,
    workspaceManager: IWorkspaceManager,
    apiClient: IFabricApiClient,
    databaseTreeNode: AbstractDatabaseTreeNode
): Promise<void> {
    const connectionString = await databaseTreeNode.getConnectionString(apiClient);

    const event = new TelemetryEvent<TelemetryEventNames>('item/copy/connection-string', telemetryService);
    event.addOrUpdateProperties({
        'workspaceId': databaseTreeNode.artifact.workspaceId,
        'fabricWorkspaceName': workspaceManager.currentWorkspace!.displayName,
        'artifactId': databaseTreeNode.artifact.id,
        'itemType': databaseTreeNode.artifact.type,
        'fabricArtifactName': databaseTreeNode.artifact.displayName,
    });
    event.sendTelemetry();

    await vscode.env.clipboard.writeText(connectionString);
}
