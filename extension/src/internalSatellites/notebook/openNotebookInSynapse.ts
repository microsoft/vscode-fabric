// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { ArtifactPropertyNames, TelemetryEvent, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IArtifact } from '@microsoft/vscode-fabric-api';

/* eslint-disable @typescript-eslint/naming-convention */
type TelemetryEventNames = {
    'item/open/synapse': { properties: ArtifactPropertyNames; measurements: never }
};

function getExternalUri(artifact: IArtifact): string {
    const targetUrl = `${vscode.env.uriScheme}://SynapseVSCode.synapse?workspaceId=${artifact.workspaceId}&artifactId=${artifact.id}`;
    return targetUrl;
}

export async function openNotebookInSynapse(
    telemetryService: TelemetryService,
    artifact: IArtifact): Promise<void> {
    const targetUrl = getExternalUri(artifact);

    const event = new TelemetryEvent<TelemetryEventNames>('item/open/synapse', telemetryService);
    event.addOrUpdateProperties({
        'workspaceId': artifact.workspaceId,
        'artifactId': artifact.id,
        'itemType': artifact.type,
        'fabricArtifactName': artifact.displayName,
    });
    event.sendTelemetry();

    await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
}
