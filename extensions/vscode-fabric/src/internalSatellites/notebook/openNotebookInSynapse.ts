import * as vscode from 'vscode';

import { NotebookTreeNode } from './NotebookTreeNode';
import { ArtifactPropertyNames, TelemetryEvent, TelemetryService } from '@microsoft/vscode-fabric-util';

/* eslint-disable @typescript-eslint/naming-convention */
type TelemetryEventNames = {
    'item/open/synapse': { properties: ArtifactPropertyNames; measurements: never }
};

export async function openNotebookInSynapse(
    telemetryService: TelemetryService,    
    treeNode: NotebookTreeNode): Promise<void> {
    const targetUrl = await treeNode.getExternalUri();

    const event = new TelemetryEvent<TelemetryEventNames>('item/open/synapse', telemetryService);
    event.addOrUpdateProperties({
        'workspaceId': treeNode.artifact.workspaceId,
        'artifactId': treeNode.artifact.id,
        'itemType': treeNode.artifact.type,
        'fabricArtifactName': treeNode.artifact.displayName,
    });
    event.sendTelemetry();

    await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
}