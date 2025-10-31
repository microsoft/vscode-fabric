// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderPromptMode, LocalFolderSaveBehavior } from '../LocalFolderService';
import { downloadAndSaveArtifact, handleSavePreferenceDialog, showFolderActionDialog, FolderAction } from './localFolderCommandHelpers';
import { changeLocalFolderCommand } from './changeLocalFolderCommand';
import { IWorkspace } from '@microsoft/vscode-fabric-api';

export async function openLocalFolderCommand(
    artifact: IArtifact,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    conflictDetector: IItemDefinitionConflictDetector,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    // Check if we already have a local folder for this artifact
    const existingFolder = await localFolderService.getLocalFolder(artifact, { prompt: LocalFolderPromptMode.never });

    if (existingFolder) {
        // We have an existing folder, show action dialog with option to choose different folder
        const choice = await showFolderActionDialog(
            existingFolder.uri,
            vscode.l10n.t(`How would you like to open ${existingFolder.uri.fsPath}?`),
            { modal: true, includeDoNothing: false, includeChooseDifferent: true }
        );

        // If user chose to select a different folder, prompt for new folder
        if (choice === FolderAction.chooseDifferentFolder) {
            // Delegate to changeLocalFolderCommand with skipWarning and promptForSave options
            await changeLocalFolderCommand(
                artifact,
                workspaceManager,
                artifactManager,
                localFolderService,
                configurationProvider,
                conflictDetector,
                itemDefinitionWriter,
                telemetryActivity,
                { skipWarning: true, promptForSave: true }
            );
        }
        return;
    }

    // No existing folder - ask user if they want to select a folder
    const selectFolderOption = vscode.l10n.t('Select folder');

    const userChoice = await vscode.window.showInformationMessage(
        vscode.l10n.t('No local folder is mapped for {0}. Would you like to select a folder?', artifact.displayName),
        { modal: true },
        selectFolderOption
    );

    if (userChoice !== selectFolderOption) {
        throw new UserCancelledError('localFolderSelection');
    }

    // Use localFolderService to select folder
    const localFolderResults = await localFolderService.getLocalFolder(
        artifact,
        {
            prompt: LocalFolderPromptMode.always,
            create: false,
        }
    );

    if (!localFolderResults) {
        throw new UserCancelledError('localFolderSelection');
    }

    // Download the artifact to the selected folder
    await downloadAndSaveArtifact(
        artifact,
        localFolderResults.uri,
        artifactManager,
        conflictDetector,
        itemDefinitionWriter,
        telemetryActivity
    );

    // Handle save preference based on user's LocalFolderSaveBehavior setting
    void handleSavePreferenceDialog(
        artifact,
        localFolderResults.uri,
        localFolderService,
        configurationProvider,
        localFolderResults.prompted
    );

    // Show action dialog
    await showFolderActionDialog(
        localFolderResults.uri,
        vscode.l10n.t('Local folder selected. How would you like to open it?'),
        { modal: true, includeDoNothing: false }
    );
}
