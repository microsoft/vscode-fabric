// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderSaveBehavior } from '../LocalFolderService';

/**
 * Downloads an artifact from the API and saves it to the specified folder.
 * Handles conflict detection, user confirmation, and error handling.
 */
export async function downloadAndSaveArtifact(
    artifact: IArtifact,
    targetFolder: vscode.Uri,
    artifactManager: IArtifactManager,
    conflictDetector: IItemDefinitionConflictDetector,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Opening {0}...', artifact.displayName),
            cancellable: false,
        },
        async (progress) => {
            // Invoke API to download the artifact
            const response = await artifactManager.getArtifactDefinition(artifact, targetFolder, { progress });
            telemetryActivity.addOrUpdateProperties({
                'statusCode': response?.status.toString(),
            });

            if (succeeded(response)) {
                // Check for conflicts and get user confirmation if needed
                const conflicts = await conflictDetector.getConflictingFiles(response.parsedBody?.definition, targetFolder);
                if (conflicts.length > 0) {
                    const confirm = await vscode.window.showWarningMessage(
                        vscode.l10n.t('The following files already exist and will be overwritten:\n{0}\nDo you want to continue?', conflicts.join('\n')),
                        { modal: true },
                        vscode.l10n.t('Yes')
                    );
                    if (confirm !== vscode.l10n.t('Yes')) {
                        throw new UserCancelledError('overwriteExportFiles');
                    }
                }

                // Save the artifact definition to disk
                await itemDefinitionWriter.save(response.parsedBody?.definition, targetFolder);
            }
            else {
                // Handle API errors
                telemetryActivity.addOrUpdateProperties({
                    'requestId': response.parsedBody?.requestId,
                    'errorCode': response.parsedBody?.errorCode,
                });

                throw new FabricError(
                    formatErrorResponse(vscode.l10n.t('Error downloading {0}', artifact.displayName), response),
                    response.parsedBody?.errorCode || `Download failed ${artifact.type} ${response.status}`,
                    { showInUserNotification: 'Information' }
                );
            }
        }
    );
}

/**
 * Copies all contents from a source folder to a target folder.
 * Used when user chooses to copy from existing folder instead of downloading fresh.
 */
export async function copyFolderContents(
    sourceFolder: vscode.Uri,
    targetFolder: vscode.Uri,
    fileSystem: vscode.FileSystem = vscode.workspace.fs
): Promise<void> {
    try {
        // Check if source folder exists
        await fileSystem.stat(sourceFolder);

        // Copy all contents from source folder to target folder
        const sourceFiles = await fileSystem.readDirectory(sourceFolder);

        for (const [fileName, fileType] of sourceFiles) {
            const sourceFile = vscode.Uri.joinPath(sourceFolder, fileName);
            const targetFile = vscode.Uri.joinPath(targetFolder, fileName);

            if (fileType === vscode.FileType.File || fileType === vscode.FileType.Directory) {
                await fileSystem.copy(sourceFile, targetFile, { overwrite: true });
            }
        }
    }
    catch (error) {
        throw new FabricError(
            vscode.l10n.t('Error copying from existing folder: {0}', error instanceof Error ? error.message : 'Unknown error'),
            'Copy from existing folder failed',
            { showInUserNotification: 'Information' }
        );
    }
}

/**
 * Handles the save preference dialog for remembering folder locations.
 * Checks the current LocalFolderSaveBehavior and either:
 * - Auto-saves if set to 'always'
 * - Does nothing if set to 'never'
 * - Shows a prompt if set to 'prompt'
 * 
 * @param prompted - If true, indicates the user was prompted to select this folder (vs. using a saved/default folder)
 */
export async function handleSavePreferenceDialog(
    artifact: IArtifact,
    folderUri: vscode.Uri,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    prompted: boolean
): Promise<void> {
    // Only handle save preference if the user was prompted to select a folder
    if (!prompted) {
        return;
    }

    const currentBehavior = configurationProvider.get<LocalFolderSaveBehavior>('LocalFolderSaveBehavior', LocalFolderSaveBehavior.prompt);

    // Auto-save without prompting
    if (currentBehavior === LocalFolderSaveBehavior.always) {
        await localFolderService.updateLocalFolder(artifact, folderUri);
        return;
    }

    // Don't save
    if (currentBehavior === LocalFolderSaveBehavior.never) {
        return;
    }

    // Show prompt (LocalFolderSaveBehavior.prompt)
    const yesOption = vscode.l10n.t('Yes');
    const noOption = vscode.l10n.t('No');
    const alwaysOption = vscode.l10n.t('Always');
    const neverOption = vscode.l10n.t('Never');

    // Show the save preference dialog without awaiting (non-modal)
    void vscode.window.showInformationMessage(
        vscode.l10n.t('Do you want to remember this folder location for future use?'),
        yesOption,
        noOption,
        alwaysOption,
        neverOption
    ).then(async (choice) => {
        if (!choice) {
            return; // User dismissed
        }

        let shouldSave = false;
        let newBehavior: LocalFolderSaveBehavior | undefined;

        switch (choice) {
            case yesOption:
                shouldSave = true;
                break;
            case noOption:
                shouldSave = false;
                break;
            case alwaysOption:
                shouldSave = true;
                newBehavior = LocalFolderSaveBehavior.always;
                break;
            case neverOption:
                shouldSave = false;
                newBehavior = LocalFolderSaveBehavior.never;
                break;
        }

        try {
            // Update global behavior if changed
            if (newBehavior) {
                await configurationProvider.update('LocalFolderSaveBehavior', newBehavior);
            }

            // Handle saving/not saving the path
            if (shouldSave) {
                await localFolderService.updateLocalFolder(artifact, folderUri);
            }
        }
        catch (error) {
            console.error('Error handling save preference:', error);
        }
    });
}

/**
 * Gets the display name for a folder from its URI.
 */
export function getFolderDisplayName(uri: vscode.Uri): string {
    return uri.path.split('/').pop() || uri.fsPath.split(/[/\\]/).pop() || 'folder';
}

/**
 * Enum representing the possible actions a user can take with a folder.
 */
export enum FolderAction {
    doNothing = 'doNothing',
    openInCurrentWindow = 'openInCurrentWindow',
    openInNewWindow = 'openInNewWindow',
    addToWorkspace = 'addToWorkspace',
    chooseDifferentFolder = 'chooseDifferentFolder'
}

/**
 * Represents a folder action option with both display title and action value.
 */
interface FolderActionItem extends vscode.MessageItem {
    action: FolderAction;
}

/**
 * Shows folder action dialog with options to add to workspace, open in current window, or open in new window.
 */
export async function showFolderActionDialog(
    folderUri: vscode.Uri,
    message: string,
    options?: { modal?: boolean; includeDoNothing?: boolean; includeChooseDifferent?: boolean }
): Promise<FolderAction | undefined> {
    const modal = options?.modal ?? false;
    const includeDoNothing = options?.includeDoNothing ?? true;
    const includeChooseDifferent = options?.includeChooseDifferent ?? false;

    // Build the action items array in the correct order
    const actionItems: FolderActionItem[] = [];

    if (includeDoNothing) {
        actionItems.push({ title: vscode.l10n.t('Do nothing'), action: FolderAction.doNothing });
    }

    actionItems.push({ title: vscode.l10n.t('Open in current window'), action: FolderAction.openInCurrentWindow });
    actionItems.push({ title: vscode.l10n.t('Open in new window'), action: FolderAction.openInNewWindow });

    // Add "Add to workspace" option only if there's an open workspace
    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
    if (hasWorkspace) {
        actionItems.push({ title: vscode.l10n.t('Add folder to workspace'), action: FolderAction.addToWorkspace });
    }

    if (includeChooseDifferent) {
        actionItems.push({ title: vscode.l10n.t('Choose different folder'), action: FolderAction.chooseDifferentFolder });
    }

    const choice = await vscode.window.showInformationMessage(
        message,
        modal ? { modal: true } : {},
        ...actionItems
    );

    if (!choice) {
        return undefined; // User dismissed
    }

    const action = choice.action;

    if (action === FolderAction.doNothing) {
        return undefined;
    }

    // Return early for "Choose different folder" - no action to perform
    if (action === FolderAction.chooseDifferentFolder) {
        return action;
    }

    // Perform the folder action
    switch (action) {
        case FolderAction.addToWorkspace:
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            const updatedFolders = [
                ...workspaceFolders.map(folder => ({ uri: folder.uri, name: folder.name })),
                { uri: folderUri }
            ];
            await vscode.workspace.updateWorkspaceFolders(workspaceFolders.length, 0, ...updatedFolders.slice(workspaceFolders.length));
            break;
        case FolderAction.openInCurrentWindow:
            await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
            break;
        case FolderAction.openInNewWindow:
            await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
            break;
    }

    return action;
}
