// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, UserCancelledError, FabricError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { FolderTreeNode } from '../workspace/treeNodes/FolderTreeNode';
import { succeeded, formatErrorResponse } from '../utilities';

/**
 * Command to delete a folder from a workspace.
 * Only empty folders can be deleted.
 */
export class DeleteFolderCommand extends FabricCommand<'folder/delete'> {
    public readonly commandName = commandNames.deleteFolder;
    public readonly telemetryEventName = 'folder/delete' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        const folderTreeNode = args[0] as FolderTreeNode | undefined;
        if (!folderTreeNode) {
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Please right-click on a folder in the Fabric explorer to delete it.')
            );
            return;
        }

        const folderName = folderTreeNode.folder.displayName;

        telemetryActivity.addOrUpdateProperties({
            workspaceId: folderTreeNode.workspaceId,
            folderId: folderTreeNode.folderId,
        });

        // Check if folder has children
        if (folderTreeNode.hasChildren()) {
            void vscode.window.showWarningMessage(
                vscode.l10n.t(
                    'Cannot delete folder "{0}" because it contains items. Please delete or move all items first.',
                    folderName
                )
            );
            throw new UserCancelledError('folderNotEmpty');
        }

        // Confirm delete
        const confirmMessage = vscode.l10n.t(
            'Are you sure you want to delete the folder "{0}"?',
            folderName
        );
        const deleteAction = vscode.l10n.t('Delete');
        const result = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            deleteAction
        );

        if (result !== deleteAction) {
            throw new UserCancelledError('deleteConfirmation');
        }

        const response = await this.commandManager.workspaceManager.deleteFolder(
            folderTreeNode.workspaceId,
            folderTreeNode.folderId
        );

        telemetryActivity.addOrUpdateProperties({
            'statusCode': response.status.toString(),
        });

        if (succeeded(response)) {
            this.commandManager.dataProvider.refresh();
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Deleted folder "{0}"', folderName)
            );
        } else {
            telemetryActivity.addOrUpdateProperties({
                'requestId': response.parsedBody?.requestId,
                'errorCode': response.parsedBody?.errorCode,
            });

            // Check if the error is because the folder is not empty
            const errorCode = response.parsedBody?.errorCode;
            if (errorCode === 'FolderNotEmpty') {
                throw new FabricError(
                    vscode.l10n.t(
                        'Cannot delete folder "{0}" because it contains items. Please delete or move all items first.',
                        folderName
                    ),
                    errorCode,
                    { showInUserNotification: 'Information' }
                );
            }

            throw new FabricError(
                formatErrorResponse(
                    vscode.l10n.t('Error deleting folder "{0}"', folderName),
                    response
                ),
                errorCode || 'Error deleting folder',
                { showInUserNotification: 'Information' }
            );
        }
    }
}
