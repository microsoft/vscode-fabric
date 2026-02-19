// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { DefinitionFileSystemProvider } from '../workspace/DefinitionFileSystemProvider';
import { DefinitionFileTreeNode } from '../workspace/treeNodes/DefinitionFileTreeNode';
import { DefinitionFolderTreeNode } from '../workspace/treeNodes/DefinitionFolderTreeNode';

/**
 * Command to delete a file or folder from an item definition.
 */
export class DeleteDefinitionFileCommand extends FabricCommand<'item/definition/deleteFile'> {
    public readonly commandName = commandNames.deleteDefinitionFile;
    public readonly telemetryEventName = 'item/definition/deleteFile' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        const node = args[0] as DefinitionFileTreeNode | DefinitionFolderTreeNode | undefined;
        if (!node) {
            this.commandManager.logger.error('deleteDefinitionFile called without a valid tree node');
            return;
        }

        let artifact;
        let targetPath: string;
        let displayName: string;
        let isFolder: boolean;

        if (node instanceof DefinitionFileTreeNode) {
            artifact = node.artifact;
            targetPath = node.fileName;
            displayName = (node.label as string) || node.fileName;
            isFolder = false;
        }
        else if (node instanceof DefinitionFolderTreeNode) {
            artifact = node.artifact;
            targetPath = node.folderPath;
            displayName = node.folderName;
            isFolder = true;
        }
        else {
            this.commandManager.logger.error('deleteDefinitionFile called with unsupported node type');
            return;
        }

        this.addArtifactTelemetryProperties(telemetryActivity, artifact);

        // Confirm deletion
        const confirmMessage = isFolder
            ? vscode.l10n.t('Are you sure you want to delete folder "{0}" and all its contents?', displayName)
            : vscode.l10n.t('Are you sure you want to delete "{0}"?', displayName);

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            vscode.l10n.t('Delete')
        );

        if (!confirmed) {
            return; // User cancelled
        }

        // Build the URI and delete
        const uri = vscode.Uri.parse(
            `${DefinitionFileSystemProvider.scheme}:///${artifact.workspaceId}/${artifact.id}/${targetPath}`
        );

        await vscode.workspace.fs.delete(uri, { recursive: isFolder });

        // Refresh the tree view
        await vscode.commands.executeCommand(commandNames.refreshArtifactView);
    }
}
