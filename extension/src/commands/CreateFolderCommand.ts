// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, UserCancelledError, FabricError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { WorkspaceTreeNode } from '../workspace/treeNodes/WorkspaceTreeNode';
import { FolderTreeNode } from '../workspace/treeNodes/FolderTreeNode';
import { showSignInPrompt } from '../ui/prompts';
import { succeeded, formatErrorResponse } from '../utilities';

/**
 * Command to create a new folder in a workspace.
 * Can be invoked from a workspace node or folder node context menu.
 */
export class CreateFolderCommand extends FabricCommand<'folder/create'> {
    public readonly commandName = commandNames.createFolder;
    public readonly telemetryEventName = 'folder/create' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        if (!(await this.commandManager.workspaceManager.isConnected())) {
            void showSignInPrompt();
            return;
        }

        let workspaceId: string | undefined;
        let parentFolderId: string | undefined;

        const contextNode = args[0];
        if (contextNode instanceof WorkspaceTreeNode) {
            workspaceId = contextNode.workspace.objectId;
        } else if (contextNode instanceof FolderTreeNode) {
            workspaceId = contextNode.workspaceId;
            parentFolderId = contextNode.folderId;
        }

        if (!workspaceId) {
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Please right-click on a workspace or folder in the Fabric explorer to create a folder.')
            );
            return;
        }

        telemetryActivity.addOrUpdateProperties({
            workspaceId,
            parentFolderId: parentFolderId ?? 'root',
        });

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

        const response = await this.commandManager.workspaceManager.createFolder(
            workspaceId,
            folderName.trim(),
            parentFolderId
        );

        telemetryActivity.addOrUpdateProperties({
            'statusCode': response.status.toString(),
        });

        if (succeeded(response)) {
            if (response.parsedBody?.id) {
                telemetryActivity.addOrUpdateProperties({
                    'folderId': response.parsedBody.id,
                });
            }
            this.commandManager.dataProvider.refresh();
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Created folder "{0}"', folderName.trim())
            );
        } else {
            telemetryActivity.addOrUpdateProperties({
                'requestId': response.parsedBody?.requestId,
                'errorCode': response.parsedBody?.errorCode,
            });
            throw new FabricError(
                formatErrorResponse(
                    vscode.l10n.t('Error creating folder "{0}"', folderName.trim()),
                    response
                ),
                response.parsedBody?.errorCode || 'Error creating folder',
                { showInUserNotification: 'Information' }
            );
        }
    }
}
