// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { isDirectory } from '../utilities';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderPromptMode } from '../LocalFolderService';
import { exportArtifactCommand } from './exportArtifactCommand';
import { downloadAndSaveArtifact, copyFolderContents, getFolderDisplayName, showFolderActionAndSavePreference, LocalFolderServices, FolderActionRequest } from './localFolderCommandHelpers';

export async function changeLocalFolderCommand(
    artifact: IArtifact,
    artifactManager: IArtifactManager,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    conflictDetector: IItemDefinitionConflictDetector,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
    options?: { skipWarning?: boolean; promptForSave?: boolean }
): Promise<void> {
    // Check if there's already a local folder mapped for this artifact
    const existingFolder = await localFolderService.getLocalFolder(artifact, { prompt: LocalFolderPromptMode.never });

    if (!existingFolder || !(await isDirectory(vscode.workspace.fs, existingFolder.uri, false))) {
        // No existing folder, just call exportArtifactCommand
        telemetryActivity.addOrUpdateProperties({
            actionTaken: 'export',
        });

        await exportArtifactCommand(
            artifact,
            artifactManager,
            localFolderService,
            configurationProvider,
            conflictDetector,
            itemDefinitionWriter,
            telemetryActivity
        );
        return;
    }

    // Show warning message about changing the mapped folder (unless skipped)
    if (!options?.skipWarning) {
        const continueOption = vscode.l10n.t('Continue');

        const warningChoice = await vscode.window.showWarningMessage(
            vscode.l10n.t('This item is using {0}. Are you sure you want to change the folder?', existingFolder.uri.fsPath),
            { modal: true },
            continueOption
        );

        if (warningChoice !== continueOption) {
            throw new UserCancelledError('verifyFolderChange');
        }
    }

    // Ask user if they want to download fresh or copy from existing
    const downloadOption = vscode.l10n.t('Download');
    const copyOption = vscode.l10n.t('Copy');

    const sourceChoice = await vscode.window.showInformationMessage(
        vscode.l10n.t('Do you want to download the item definition from Fabric or copy files from {0}?', existingFolder.uri.fsPath),
        { modal: true },
        downloadOption,
        copyOption
    );

    if (!sourceChoice) {
        throw new UserCancelledError('populateFolder');
    }

    // Use localFolderService to select new folder
    const localFolderResults = await localFolderService.getLocalFolder(
        artifact,
        {
            prompt: LocalFolderPromptMode.always,
            create: true,
        }
    );

    if (!localFolderResults) {
        throw new UserCancelledError('selectFolder');
    }

    const targetFolder = localFolderResults.uri;

    try {
        if (sourceChoice === downloadOption) {
            telemetryActivity.addOrUpdateProperties({
                actionTaken: 'download',
            });
            // Download fresh from API
            await downloadAndSaveArtifact(
                artifact,
                targetFolder,
                artifactManager,
                conflictDetector,
                itemDefinitionWriter,
                telemetryActivity
            );
        }
        else {
            telemetryActivity.addOrUpdateProperties({
                actionTaken: 'copy',
            });
            // Copy from existing folder
            await copyFolderContents(existingFolder.uri, targetFolder);
        }

        // Save the new folder location (or prompt if requested)
        const services: LocalFolderServices = { localFolderService, configurationProvider };
        const folderName = getFolderDisplayName(targetFolder);

        if (options?.promptForSave) {
            // Use the integrated helper that handles save preference and folder action
            const request: FolderActionRequest = { folderUri: targetFolder, artifact, prompted: localFolderResults.prompted };
            await showFolderActionAndSavePreference(
                vscode.l10n.t('Local folder for {0} has been changed to {1}. What would you like to do?', artifact.displayName, folderName),
                request,
                services
            );
        }
        else {
            // Automatically save the new folder location, then show folder action
            await localFolderService.updateLocalFolder(artifact, targetFolder);

            const request: FolderActionRequest = { folderUri: targetFolder, artifact, prompted: false };
            await showFolderActionAndSavePreference(
                vscode.l10n.t('Local folder for {0} has been changed to {1}. What would you like to do?', artifact.displayName, folderName),
                request,
                services
            );
        }
    }
    catch (error: any) {
        if (error instanceof UserCancelledError) {
            throw error; // Let UserCancelledError propagate
        }
        throw new FabricError(
            vscode.l10n.t('Error changing local folder for {0}: {1}', artifact.displayName, error.message ?? 'Unknown error'),
            `Change local folder failed for ${artifact.type}`,
            { showInUserNotification: 'Information' }
        );
    }
}
