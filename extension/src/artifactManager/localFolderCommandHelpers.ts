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
            title: vscode.l10n.t('Downloading {0}...', artifact.displayName),
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
 * Handles the save preference workflow for remembering folder locations.
 * Checks the current LocalFolderSaveBehavior and either:
 * - Auto-saves if set to 'always'
 * - Does nothing if set to 'never'
 * - Shows a prompt if set to 'prompt'
 *
 * @param prompted - If true, indicates the user was prompted to select this folder (vs. using a saved/default folder)
 */
async function handleLocalFolderSavePreference(
    artifact: IArtifact,
    folderUri: vscode.Uri,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    prompted: boolean,
    options?: { modal?: boolean;  }
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

    const modal = options?.modal ?? false;

    const handleChoice = async (choice: string | undefined) => {
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
    };

    if (modal) {
        // Show modal dialog and await the response
        const choice = await vscode.window.showInformationMessage(
            vscode.l10n.t('Do you want to remember folder {0} to use for {1} in the future?', folderUri.fsPath, artifact.displayName),
            { modal: true },
            yesOption,
            noOption,
            alwaysOption,
            neverOption
        );
        await handleChoice(choice);
    }
    else {
        // Show non-modal dialog without awaiting
        void vscode.window.showInformationMessage(
            vscode.l10n.t('Do you want to remember folder {0} to use for {1} in the future?', folderUri.fsPath, artifact.displayName),
            yesOption,
            noOption,
            alwaysOption,
            neverOption
        ).then(handleChoice);
    }
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
    message: string,
    options?: { modal?: boolean; includeDoNothing?: boolean; }
): Promise<FolderAction | undefined> {
    const modal = options?.modal ?? false;
    const includeDoNothing = options?.includeDoNothing ?? true;

    // Build the action items array in the correct order
    const actionItems: FolderActionItem[] = [];

    if (includeDoNothing) {
        actionItems.push({ title: vscode.l10n.t('Do nothing'), action: FolderAction.doNothing });
    }

    actionItems.push({ title: vscode.l10n.t('Open in current window'), action: FolderAction.openInCurrentWindow });
    actionItems.push({ title: vscode.l10n.t('Open in new window'), action: FolderAction.openInNewWindow });

    const choice = await vscode.window.showInformationMessage(
        message,
        modal ? { modal: true } : {},
        ...actionItems
    );

    if (!choice) {
        return undefined; // User dismissed
    }

    return choice.action;
}

async function performFolderAction(folderUri: vscode.Uri, action: FolderAction): Promise<void> {
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
}

/**
 * Performs a folder action with integrated save preference handling.
 * 
 * This helper handles the workflow of:
 * 1. Detecting if the action will update the workspace (causing extension reload)
 * 2. If updating workspace: handling save preference with modal dialog BEFORE reload
 * 3. Performing the selected action
 * 4. If not updating workspace: handling save preference with non-modal dialog AFTER action
 * 
 * @param folderUri - The URI of the folder to work with
 * @param action - The folder action to perform
 * @param artifact - The artifact associated with the folder
 * @param localFolderService - Service for managing local folder mappings
 * @param configurationProvider - Provider for accessing user configuration
 * @param prompted - Whether the user was prompted to select this folder
 */
export async function performFolderActionAndSavePreference(
    folderUri: vscode.Uri,
    action: FolderAction,
    artifact: IArtifact,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    prompted: boolean
): Promise<void> {
    // Check if this action will update the workspace (causing extension reload)
    const updatingWorkspace: boolean = (action === FolderAction.addToWorkspace || action === FolderAction.openInCurrentWindow);

    // If updating workspace, handle save preference with modal dialog BEFORE reload
    if (updatingWorkspace) {
        await handleLocalFolderSavePreference(
            artifact,
            folderUri,
            localFolderService,
            configurationProvider,
            prompted,
            { modal: true }
        );
    }

    // Perform the selected action
    if (action !== FolderAction.doNothing) {
        await performFolderAction(folderUri, action);
    }

    // If not updating workspace, handle save preference with non-modal dialog AFTER action
    if (!updatingWorkspace) {
        void handleLocalFolderSavePreference(
            artifact,
            folderUri,
            localFolderService,
            configurationProvider,
            prompted
        );
    }
}

/**
 * Shows a folder action dialog and performs the selected action with integrated save preference handling.
 *
 * This helper encapsulates the common workflow of:
 * 1. Showing the folder action dialog
 * 2. Performing the selected action with save preference handling
 *
 * @param folderUri - The URI of the folder to work with
 * @param artifact - The artifact associated with the folder
 * @param localFolderService - Service for managing local folder mappings
 * @param configurationProvider - Provider for accessing user configuration
 * @param prompted - Whether the user was prompted to select this folder
 * @param message - The message to display in the folder action dialog
 * @param options - Optional configuration for the dialog (modal, includeDoNothing)
 * @returns The selected FolderAction, or undefined if user cancelled
 */
export async function showFolderActionAndSavePreference(
    message: string,
    folderUri: vscode.Uri,
    artifact: IArtifact,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    prompted: boolean,
    options?: { modal?: boolean; includeDoNothing?: boolean; }
): Promise<FolderAction | undefined> {
    // Show folder action dialog
    const action = await showFolderActionDialog(message, options);

    if (!action) {
        return undefined; // User cancelled
    }

    // Perform the action with save preference handling
    await performFolderActionAndSavePreference(
        folderUri,
        action,
        artifact,
        localFolderService,
        configurationProvider,
        prompted
    );

    return action;
}
