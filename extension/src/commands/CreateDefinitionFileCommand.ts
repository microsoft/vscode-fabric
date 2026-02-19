// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { DefinitionFileSystemProvider } from '../workspace/DefinitionFileSystemProvider';
import { DefinitionRootTreeNode } from '../workspace/treeNodes/DefinitionRootTreeNode';
import { DefinitionFolderTreeNode } from '../workspace/treeNodes/DefinitionFolderTreeNode';

/**
 * Command to create a new file within an item definition.
 * Can be invoked from the definition root or a folder node.
 */
export class CreateDefinitionFileCommand extends FabricCommand<'item/definition/createFile'> {
    public readonly commandName = commandNames.createDefinitionFile;
    public readonly telemetryEventName = 'item/definition/createFile' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        const node = args[0] as DefinitionRootTreeNode | DefinitionFolderTreeNode | undefined;
        if (!node) {
            this.commandManager.logger.error('createDefinitionFile called without a valid tree node');
            return;
        }

        // Resolve artifact and folder path from the node type
        let artifact;
        let folderPath: string;

        if (node instanceof DefinitionRootTreeNode) {
            artifact = node.artifact;
            folderPath = '';
        }
        else if (node instanceof DefinitionFolderTreeNode) {
            artifact = node.artifact;
            folderPath = node.folderPath;
        }
        else {
            this.commandManager.logger.error('createDefinitionFile called with unsupported node type');
            return;
        }

        this.addArtifactTelemetryProperties(telemetryActivity, artifact);

        // Prompt user for the new file name
        const fileName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Enter the name for the new file'),
            placeHolder: vscode.l10n.t('example.json'),
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return vscode.l10n.t('File name cannot be empty');
                }
                if (value.includes('/') || value.includes('\\')) {
                    return vscode.l10n.t('File name cannot contain path separators');
                }
                return undefined;
            },
        });

        if (!fileName) {
            return; // User cancelled
        }

        const fileExtension = fileName.split('.').pop() || '';
        telemetryActivity.addOrUpdateProperties({ fileExtension });

        // Build the full path within the definition
        const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;

        // Build the URI and write an empty file
        const uri = vscode.Uri.parse(
            `${DefinitionFileSystemProvider.scheme}:///${artifact.workspaceId}/${artifact.id}/${fullPath}`
        );

        await vscode.workspace.fs.writeFile(uri, new Uint8Array(0));

        // Open the newly created file for editing
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        // Refresh the tree view
        await vscode.commands.executeCommand(commandNames.refreshArtifactView);
    }
}
