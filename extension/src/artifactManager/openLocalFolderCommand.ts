// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderPromptMode, LocalFolderSaveBehavior } from '../LocalFolderService';
import { downloadAndSaveArtifact, handleLocalFolderSavePreference, showFolderActionDialog, FolderAction, performFolderAction } from './localFolderCommandHelpers';
import { changeLocalFolderCommand } from './changeLocalFolderCommand';

export async function openLocalFolderCommand(
    artifact: IArtifact,
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
            vscode.l10n.t('How would you like to open {0}?', existingFolder.uri.fsPath),
            { modal: true, includeDoNothing: false }
        );

        telemetryActivity.addOrUpdateProperties({
            actionTaken: choice === FolderAction.chooseDifferentFolder ? 'change' : 'open',
        });

        // If user chose to select a different folder, prompt for new folder
        if (choice === FolderAction.chooseDifferentFolder) {
            // Delegate to changeLocalFolderCommand with skipWarning and promptForSave options
            await changeLocalFolderCommand(
                artifact,
                artifactManager,
                localFolderService,
                configurationProvider,
                conflictDetector,
                itemDefinitionWriter,
                telemetryActivity,
                { skipWarning: true, promptForSave: true }
            );
        }
        else if (choice) {
            const updatingWorkspace: boolean = (choice === FolderAction.addToWorkspace || choice === FolderAction.openInCurrentWindow);

            // Updating the workspace means the extension is going to get reloaded. Let's get the save preference before that happens
            if (updatingWorkspace) {
                // Handle save preference based on user's LocalFolderSaveBehavior setting
                await handleLocalFolderSavePreference(
                    artifact,
                    existingFolder.uri,
                    localFolderService,
                    configurationProvider,
                    false,
                    { modal: true }
                );
            }

            await performFolderAction(existingFolder.uri, choice);

            if (!updatingWorkspace) {
                void handleLocalFolderSavePreference(
                    artifact,
                    existingFolder.uri,
                    localFolderService,
                    configurationProvider,
                    false
                );
            }
        }

        return;
    }

    // No existing folder - ask user if they want to select a folder
    const selectFolderOption = vscode.l10n.t('Select folder');

    const userChoice = await vscode.window.showInformationMessage(
        vscode.l10n.t('No local folder has been selected for {0}. Would you like to select a folder?', artifact.displayName),
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

    telemetryActivity.addOrUpdateProperties({
        actionTaken: 'export',
    });

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
    void handleLocalFolderSavePreference(
        artifact,
        localFolderResults.uri,
        localFolderService,
        configurationProvider,
        localFolderResults.prompted
    );

    // Show action dialog
    await showFolderActionDialog(
        vscode.l10n.t('How would you like to open {0}?', localFolderResults.uri.fsPath),
        { modal: true, includeDoNothing: false }
    );
}
