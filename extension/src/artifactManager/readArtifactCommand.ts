// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager, Schema } from '@microsoft/vscode-fabric-api';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';

export async function readArtifactCommand(
    artifact: IArtifact,
    artifactManager: IArtifactManager,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    const response = await artifactManager.getArtifact(artifact);
    telemetryActivity.addOrUpdateProperties({
        'statusCode': response?.status.toString(),
    });

    if (succeeded(response)) {
        const payload = response.bodyAsText ?? undefined;

        if (payload !== undefined) {
            const query = '?content=' + encodeURIComponent(payload);
            const furi = vscode.Uri.parse(
                Schema.fabricVirtualDoc + ':/'
                + artifact.displayName + '.json' + query);
            const doc = await vscode.workspace.openTextDocument(furi);
            await vscode.window.showTextDocument(doc, { preserveFocus: true });
        }
    }
    else {
        telemetryActivity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode,
        });

        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error reading {0}', artifact.displayName), response),
            response.parsedBody?.errorCode || 'Error reading item',
            { showInUserNotification: 'Information' }
        );
    }
}
