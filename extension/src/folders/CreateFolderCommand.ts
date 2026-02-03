// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { FabricCommand } from '../commands/FabricCommand';
import { IFabricCommandManager } from '../commands/IFabricCommandManager';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { commandNames } from '../constants';
import { showSignInPrompt } from '../ui/prompts';
import { FolderTreeNode } from '../workspace/treeNodes/FolderTreeNode';
import { succeeded, formatErrorResponse } from '../utilities';

/**
 * Command to create a new folder in a Fabric workspace
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
        // Check authentication
        if (!(await this.commandManager.workspaceManager.isConnected())) {
            void showSignInPrompt();
            return;
        }

        let workspaceId: string | undefined;
        let parentFolderId: string | undefined;

        const contextNode = args[0];
        // Use duck-typing to check node type for better testability
        // WorkspaceTreeNode has workspace.objectId, FolderTreeNode has workspaceId and folderId
        if (contextNode instanceof FolderTreeNode) {
            workspaceId = contextNode.workspaceId;
            parentFolderId = contextNode.folderId;
        }
        else if (contextNode?.workspace?.objectId) {
            // WorkspaceTreeNode - check for workspace.objectId property
            workspaceId = contextNode.workspace.objectId;
        }

        if (!workspaceId) {
            void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a workspace or folder in the Fabric explorer to create a folder.'));
            return;
        }

        telemetryActivity.addOrUpdateProperties({
            workspaceId,
            parentFolderId: parentFolderId ?? 'root',
        });

        // Prompt for folder name
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

        const trimmedName = folderName.trim();
        const response: IApiClientResponse = await this.commandManager.workspaceManager.createFolder(
            workspaceId,
            trimmedName,
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
            void vscode.window.showInformationMessage(vscode.l10n.t('Created folder "{0}"', trimmedName));
        } else {
            telemetryActivity.addOrUpdateProperties({
                'requestId': response.parsedBody?.requestId,
                'errorCode': response.parsedBody?.errorCode,
            });
            throw new FabricError(
                formatErrorResponse(vscode.l10n.t('Error creating folder "{0}"', trimmedName), response),
                response.parsedBody?.errorCode || 'Error creating folder',
                { showInUserNotification: 'Information' }
            );
        }
    }
}
