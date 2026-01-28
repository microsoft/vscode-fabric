// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, UserCancelledError, FabricError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { FolderTreeNode } from '../workspace/treeNodes/FolderTreeNode';
import { formatErrorResponse } from '../utilities';

/**
 * Command to rename a folder in a workspace.
 */
export class RenameFolderCommand extends FabricCommand<'folder/rename'> {
    public readonly commandName = commandNames.renameFolder;
    public readonly telemetryEventName = 'folder/rename' as const;

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
                vscode.l10n.t('Please right-click on a folder in the Fabric explorer to rename it.')
            );
            return;
        }

        const currentName = folderTreeNode.folder.displayName;

        telemetryActivity.addOrUpdateProperties({
            workspaceId: folderTreeNode.workspaceId,
            folderId: folderTreeNode.folderId,
        });

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
        const response = await this.commandManager.workspaceManager.renameFolder(
            folderTreeNode.workspaceId,
            folderTreeNode.folderId,
            trimmedName
        );

        telemetryActivity.addOrUpdateProperties({
            'statusCode': response.status.toString(),
        });

        if (response.status === 200) {
            this.commandManager.dataProvider.refresh();
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Renamed folder "{0}" to "{1}"', currentName, trimmedName)
            );
        } else {
            telemetryActivity.addOrUpdateProperties({
                'requestId': response.parsedBody?.requestId,
                'errorCode': response.parsedBody?.errorCode,
            });
            throw new FabricError(
                formatErrorResponse(
                    vscode.l10n.t('Error renaming folder "{0}"', currentName),
                    response
                ),
                response.parsedBody?.errorCode || 'Error renaming folder',
                { showInUserNotification: 'Information' }
            );
        }
    }
}
