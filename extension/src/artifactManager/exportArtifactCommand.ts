// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderPromptMode } from '../LocalFolderService';
import { downloadAndSaveArtifact, handleLocalFolderSavePreference, getFolderDisplayName, showFolderActionDialog, FolderAction, performFolderAction } from './localFolderCommandHelpers';

/**
 * Shows completion message with integrated save preference handling.
 */
export async function showCompletionMessage(
    artifact: IArtifact,
    localFolderResults: { uri: vscode.Uri; prompted: boolean },
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider
): Promise<void> {
    // Get the folder name from the URI
    const folderName = getFolderDisplayName(localFolderResults.uri);
    const baseMessage = vscode.l10n.t('Item {0} has been downloaded to {1}', artifact.displayName, folderName);

    // Show folder action dialog
    const action = await showFolderActionDialog(
        vscode.l10n.t('{0}. What would you like to do?', baseMessage)
    );

    if (action) {
        const updatingWorkspace: boolean = (action === FolderAction.addToWorkspace || action === FolderAction.openInCurrentWindow);

        // Updating the workspace means the extension is going to get reloaded. Let's get the save preference before that happens
        if (updatingWorkspace) {
            // Handle save preference based on user's LocalFolderSaveBehavior setting
            await handleLocalFolderSavePreference(
                artifact,
                localFolderResults.uri,
                localFolderService,
                configurationProvider,
                localFolderResults.prompted,
                { modal: true }
            );
        }

        await performFolderAction(localFolderResults.uri, action);

        if (!updatingWorkspace) {
            void handleLocalFolderSavePreference(
                artifact,
                localFolderResults.uri,
                localFolderService,
                configurationProvider,
                localFolderResults.prompted
            );
        }
    }
}

export async function exportArtifactCommand(
    artifact: IArtifact,
    artifactManager: IArtifactManager,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    conflictDetector: IItemDefinitionConflictDetector,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    // Get the folder to export to
    const localFolderResults = await localFolderService.getLocalFolder(
        artifact,
        {
            prompt: LocalFolderPromptMode.discretionary,
            create: true,
        }
    );
    if (!localFolderResults) {
        throw new UserCancelledError('localFolderSelection');
    }

    // Download and save the artifact
    try {
        await downloadAndSaveArtifact(
            artifact,
            localFolderResults.uri,
            artifactManager,
            conflictDetector,
            itemDefinitionWriter,
            telemetryActivity
        );

        // Show completion message with integrated save preference handling
        await showCompletionMessage(
            artifact,
            localFolderResults,
            localFolderService,
            configurationProvider
        );
    }
    catch (error: any) {
        if (error instanceof UserCancelledError) {
            throw error; // Let UserCancelledError propagate
        }
        throw new FabricError(
            vscode.l10n.t('Error opening {0}: {1}', artifact.displayName, error.message ?? 'Unknown error'),
            `Opening Artifact failed during save ${artifact.type}`,
            { showInUserNotification: 'Information' }
        );
    }
}
