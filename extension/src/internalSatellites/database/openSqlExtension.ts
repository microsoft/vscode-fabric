// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { TelemetryEvent, ArtifactPropertyNames, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IFabricApiClient, IWorkspaceManager } from '@microsoft/vscode-fabric-api';

/* eslint-disable @typescript-eslint/naming-convention */
type TelemetryEventNames = {
    'item/open/sql-ext': { properties: ArtifactPropertyNames; measurements: never }
};

export async function openSqlExtensionInExternal(
    telemetryService: TelemetryService,
    workspaceManager: IWorkspaceManager,
    apiClient: IFabricApiClient,
    databaseTreeNode: AbstractDatabaseTreeNode
): Promise<void> {
    const targetUrl = await databaseTreeNode.getExternalUri(apiClient);

    const event = new TelemetryEvent<TelemetryEventNames>('item/open/sql-ext', telemetryService);
    event.addOrUpdateProperties({
        'workspaceId': databaseTreeNode.artifact.workspaceId,
        'artifactId': databaseTreeNode.artifact.id,
        'itemType': databaseTreeNode.artifact.type,
        'fabricArtifactName': databaseTreeNode.artifact.displayName,
    });
    event.sendTelemetry();

    await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
}
