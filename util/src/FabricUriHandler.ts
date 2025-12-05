// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryService } from './telemetry/TelemetryService';
import { TelemetryActivity } from './telemetry/TelemetryActivity';
import { doFabricAction, withErrorHandling } from './FabricError';
import { ILogger } from './logger/Logger';

export class FabricUriHandler implements vscode.UriHandler {
    constructor(protected telemetry: TelemetryService | null, protected logger: ILogger) {
    }

    async handleUri(uri: vscode.Uri): Promise<void> {
        await withErrorHandling('handleUri', this.logger, this.telemetry, async () => {
            const activity = new TelemetryActivity('fabric/handleUri', this.telemetry);
            return doFabricAction(
                { fabricLogger: this.logger, telemetryActivity: activity, showInUserNotification: 'Error' },
                async () => {
                    const searchParams = new URLSearchParams(uri.query);
                    const workspaceId = searchParams.get('workspaceId') || '';
                    const artifactId = searchParams.get('artifactId') || '';
                    const environmentParameter = searchParams.get('Environment');
                    const environmentId = environmentParameter ? environmentParameter.toUpperCase() : undefined;

                    this.logger.debug(`UriHandler opening workspace=${workspaceId}, artifact=${artifactId}, environment=${environmentId ?? '[not set]'}`);
                    activity.addOrUpdateProperties({
                        'targetEnvironment': environmentId ?? '',
                        'workspaceId': workspaceId,
                        'artifactId': artifactId,
                        'uriQuery': uri.query,
                    });

                    // Export the requested artifact
                    const exportParams = {
                        artifactId,
                        workspaceId,
                        ...(environmentId !== undefined && { environment: environmentId }),
                    };
                    await vscode.commands.executeCommand('vscode-fabric.exportArtifact', exportParams);
                });
        })();
    }
}
