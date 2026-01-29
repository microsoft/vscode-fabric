// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, TelemetryService, ILogger, withErrorHandling, doFabricAction, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { commandNames, fabricViewWorkspace } from '../constants';
import { showSignInPrompt } from '../ui/prompts';
import { FabricWorkspaceDataProvider } from './treeView';
import { WorkspaceTreeNode } from './treeNodes/WorkspaceTreeNode';
import { FolderTreeNode } from './treeNodes/FolderTreeNode';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { succeeded, formatErrorResponse } from '../utilities';

let folderCommandDisposables: vscode.Disposable[] = [];

function registerCommand<T>(
    commandName: string,
    callback: (...args: any[]) => Promise<T>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    folderCommandDisposables.push(disposable);
}

export function registerFolderCommands(
    context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger
): void {
    // Dispose of any existing commands
    folderCommandDisposables.forEach(disposable => disposable.dispose());
    folderCommandDisposables = [];

    registerCommand(
        commandNames.createFolder,
        async (...cmdArgs) => {
            if (!(await workspaceManager.isConnected())) {
                void showSignInPrompt();
                return;
            }

            let workspaceId: string | undefined;
            let parentFolderId: string | undefined;

            const contextNode = cmdArgs[0];
            if (contextNode instanceof WorkspaceTreeNode) {
                workspaceId = contextNode.workspace.objectId;
            } else if (contextNode instanceof FolderTreeNode) {
                workspaceId = contextNode.workspaceId;
                parentFolderId = contextNode.folderId;
            }

            if (!workspaceId) {
                void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a workspace or folder in the Fabric explorer to create a folder.'));
                return;
            }

            await doFolderAction(
                'createFolder',
                'folder/create',
                logger,
                telemetryService,
                async (activity) => {
                    activity.addOrUpdateProperties({
                        workspaceId,
                        parentFolderId: parentFolderId ?? 'root',
                    });
                    await createFolderCommand(workspaceId!, parentFolderId, workspaceManager, dataProvider, activity);
                }
            );
        },
        context
    );

    registerCommand(
        commandNames.deleteFolder,
        async (...cmdArgs) => {
            const folderTreeNode = cmdArgs[0] as FolderTreeNode | undefined;
            if (!folderTreeNode) {
                void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a folder in the Fabric explorer to delete it.'));
                return;
            }

            await doFolderAction(
                'deleteFolder',
                'folder/delete',
                logger,
                telemetryService,
                async (activity) => {
                    activity.addOrUpdateProperties({
                        workspaceId: folderTreeNode.workspaceId,
                        folderId: folderTreeNode.folderId,
                    });
                    await deleteFolderCommand(folderTreeNode, workspaceManager, dataProvider, activity);
                }
            );
        },
        context
    );

    registerCommand(
        commandNames.renameFolder,
        async (...cmdArgs) => {
            const folderTreeNode = cmdArgs[0] as FolderTreeNode | undefined;
            if (!folderTreeNode) {
                void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a folder in the Fabric explorer to rename it.'));
                return;
            }

            await doFolderAction(
                'renameFolder',
                'folder/rename',
                logger,
                telemetryService,
                async (activity) => {
                    activity.addOrUpdateProperties({
                        workspaceId: folderTreeNode.workspaceId,
                        folderId: folderTreeNode.folderId,
                    });
                    await renameFolderCommand(folderTreeNode, workspaceManager, dataProvider, activity);
                }
            );
        },
        context
    );
}

async function createFolderCommand(
    workspaceId: string,
    parentFolderId: string | undefined,
    workspaceManager: IWorkspaceManager,
    dataProvider: FabricWorkspaceDataProvider,
    activity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    const folderName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter folder name'),
        value: '',
        title: vscode.l10n.t('New Folder'),
        validateInput: (value) => {
            if (!value || !value.trim()) {
                return vscode.l10n.t('Folder name cannot be empty');
            }
            return undefined;
        },
    });

    if (!folderName || !folderName.trim()) {
        throw new UserCancelledError('folderNameInput');
    }

    const response: IApiClientResponse = await workspaceManager.createFolder(workspaceId, folderName.trim(), parentFolderId);
    activity.addOrUpdateProperties({
        'statusCode': response.status.toString(),
    });

    if (succeeded(response)) {
        if (response.parsedBody?.id) {
            activity.addOrUpdateProperties({
                'folderId': response.parsedBody.id,
            });
        }
        dataProvider.refresh();
        void vscode.window.showInformationMessage(vscode.l10n.t('Created folder "{0}"', folderName.trim()));
    } else {
        activity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode,
        });
        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error creating folder "{0}"', folderName.trim()), response),
            response.parsedBody?.errorCode || 'Error creating folder',
            { showInUserNotification: 'Information' }
        );
    }
}

async function deleteFolderCommand(
    folderTreeNode: FolderTreeNode,
    workspaceManager: IWorkspaceManager,
    dataProvider: FabricWorkspaceDataProvider,
    activity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    const folderName = folderTreeNode.folder.displayName;

    // Check if folder has children
    if (folderTreeNode.hasChildren()) {
        void vscode.window.showWarningMessage(
            vscode.l10n.t('Cannot delete folder "{0}" because it contains items. Please delete or move all items first.', folderName)
        );
        throw new UserCancelledError('folderNotEmpty');
    }

    // Confirm delete
    const confirmMessage = vscode.l10n.t('Are you sure you want to delete the folder "{0}"?', folderName);
    const deleteAction = vscode.l10n.t('Delete');
    const result = await vscode.window.showWarningMessage(confirmMessage, { modal: true }, deleteAction);

    if (result !== deleteAction) {
        throw new UserCancelledError('deleteConfirmation');
    }

    const response: IApiClientResponse = await workspaceManager.deleteFolder(
        folderTreeNode.workspaceId,
        folderTreeNode.folderId
    );
    activity.addOrUpdateProperties({
        'statusCode': response.status.toString(),
    });

    if (succeeded(response)) {
        dataProvider.refresh();
        void vscode.window.showInformationMessage(vscode.l10n.t('Deleted folder "{0}"', folderName));
    } else {
        activity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode,
        });

        // Check if the error is because the folder is not empty
        const errorCode = response.parsedBody?.errorCode;
        if (errorCode === 'FolderNotEmpty') {
            throw new FabricError(
                vscode.l10n.t('Cannot delete folder "{0}" because it contains items. Please delete or move all items first.', folderName),
                errorCode,
                { showInUserNotification: 'Information' }
            );
        }

        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error deleting folder "{0}"', folderName), response),
            errorCode || 'Error deleting folder',
            { showInUserNotification: 'Information' }
        );
    }
}

async function renameFolderCommand(
    folderTreeNode: FolderTreeNode,
    workspaceManager: IWorkspaceManager,
    dataProvider: FabricWorkspaceDataProvider,
    activity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    const currentName = folderTreeNode.folder.displayName;
    const newName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter new folder name'),
        value: currentName,
        title: vscode.l10n.t('Rename Folder'),
        validateInput: (value) => {
            if (!value || !value.trim()) {
                return vscode.l10n.t('Folder name cannot be empty');
            }
            return undefined;
        },
    });

    if (!newName || !newName.trim() || newName.trim() === currentName) {
        throw new UserCancelledError('folderNameInput');
    }

    const trimmedName = newName.trim();
    const response: IApiClientResponse = await workspaceManager.renameFolder(
        folderTreeNode.workspaceId,
        folderTreeNode.folderId,
        trimmedName
    );
    activity.addOrUpdateProperties({
        'statusCode': response.status.toString(),
    });

    if (response.status === 200) {
        dataProvider.refresh();
        void vscode.window.showInformationMessage(vscode.l10n.t('Renamed folder "{0}" to "{1}"', currentName, trimmedName));
    } else {
        activity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode,
        });
        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error renaming folder "{0}"', currentName), response),
            response.parsedBody?.errorCode || 'Error renaming folder',
            { showInUserNotification: 'Information' }
        );
    }
}

async function doFolderAction<T>(
    description: string,
    eventName: keyof CoreTelemetryEventNames,
    logger: ILogger,
    telemetryService: TelemetryService | null,
    callback: (activity: TelemetryActivity<CoreTelemetryEventNames>) => Promise<T>
): Promise<T | undefined> {
    return withErrorHandling(description, logger, telemetryService, async () => {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>(eventName, telemetryService);
        return await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            return await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                try {
                    const cbResult: T = await callback(activity);
                    activity.addOrUpdateProperties({ result: 'Succeeded' });
                    return cbResult;
                } catch (err) {
                    if (err instanceof UserCancelledError) {
                        activity.addOrUpdateProperties({ result: 'Canceled' });
                        if (err.stepName) {
                            activity.addOrUpdateProperties({ lastStep: err.stepName });
                        }
                        return;
                    }
                    activity.addOrUpdateProperties({ result: 'Failed' });
                    throw err;
                }
            });
        });
    })();
}
