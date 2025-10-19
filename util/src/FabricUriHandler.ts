// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from './telemetry/TelemetryService';
import { TelemetryActivity } from './telemetry/TelemetryActivity';
import { FABRIC_ENVIRONMENT_KEY, IFabricEnvironmentProvider } from './settings/FabricEnvironmentProvider';
import { IConfigurationProvider } from './settings/ConfigurationProvider';
import { FabricError, doFabricAction } from './FabricError';
import { FabricEnvironmentName } from './settings/FabricEnvironment';
import { ILogger } from './logger/Logger';

export class FabricUriHandler implements vscode.UriHandler {
    constructor(
        private core: IFabricExtensionServiceCollection,
        private telemetry: TelemetryService | null,
        private logger: ILogger,
        private fabricEnvironmentProvider: IFabricEnvironmentProvider,
        private configProvider: IConfigurationProvider
    ) {
        this.core = core;
        this.telemetry = telemetry;
        this.logger = logger;
    }

    handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        const activity = new TelemetryActivity('handle-uri', this.telemetry);
        return doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
            const searchParams = new URLSearchParams(uri.query);
            const workspaceId = searchParams.get('workspaceId') || '';
            const artifactId = searchParams.get('artifactId') || '';
            const environmentId = (searchParams.get('Environment') || '').toUpperCase();
            this.logger.log(`UriHandler opening ws=${workspaceId}  art = ${artifactId} env = ${environmentId}`);

            activity.addOrUpdateProperties({
                'targetEnvironment': environmentId,
                'workspaceId': workspaceId,
                'artifactId': artifactId,
                'uriQuery': uri.query,
            });

            if (!isValidWorkspaceId(workspaceId) || !isValidArtifactId(artifactId)) {
                throw new FabricError(vscode.l10n.t('Invalid workspace or artifact id {0}  {1}', workspaceId, artifactId), 'Invalid workspace or artifact id');
            }
            // handle environment param
            if (environmentId.length > 0 && !Object.values(FabricEnvironmentName).includes(environmentId as FabricEnvironmentName)) {
                throw new FabricError(vscode.l10n.t('Environment parameter not valid: {0}', environmentId), 'invalid environment');
            }
            // If the environmentId is different from the current environment, and it's valid, update the user's settings before further handling
            if (environmentId !== this.fabricEnvironmentProvider.getCurrent().env.toString()) {
                await this.configProvider.update(FABRIC_ENVIRONMENT_KEY, environmentId);
            }

            let openArtifact = false;
            if (vscode.workspace.workspaceFolders !== undefined) {
                const answer = await vscode.window.showInformationMessage(vscode.l10n.t('Do you want to close the current folder and open your Fabric item?'), { modal: true },
                    vscode.l10n.t('Yes'),
                    vscode.l10n.t('No'));
                if (answer === 'Yes') {
                    openArtifact = true;
                }
            }
            else {
                openArtifact = true;
            }
            activity.addOrUpdateProperties(
                {
                    'openArtifact': openArtifact.toString(),
                }
            );

            if (!openArtifact) {
                return;
            }

            this.core.workspaceManager.clearPriorStateIfAny();

            const artifacts = await this.core.workspaceManager.getItemsInWorkspace(workspaceId);
            const artifact = artifacts.find(e => e.id === artifactId);

            if (artifact === undefined) {
                throw new FabricError(vscode.l10n.t('Artifact id not found: \'{0}\' in workspace: \'{1}\'")', artifactId, workspaceId), 'Artifact not found in workspace');
            }

            // show the Fabric remote view
            await vscode.commands.executeCommand('workbench.view.extension.vscode-fabric_view_workspace');

            // open the artifact (registered item type handlers will be called)
            await this.core.artifactManager.openArtifact(artifact);
        });
    }
}

function isValidWorkspaceId(workspaceId: string): boolean {
    if (!isValidGuid(workspaceId)) {
        throw new FabricError(vscode.l10n.t('Invalid workspace identifier: \'{0}\'', workspaceId), 'Invalid workspace identifier');
    }
    return true;
}

function isValidArtifactId(artifactId: string): boolean {
    if (!isValidGuid(artifactId)) {
        throw new FabricError(vscode.l10n.t('Invalid artifact identifier: \'{0}\'', artifactId), 'Invalid artifact identifier');
    }
    return true;
}

function isValidGuid(guid: string): boolean { // returns false for empty string
    const guidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    return guidRegex.test(guid);
}
