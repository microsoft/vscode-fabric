// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { DefinitionFileTreeNode } from '../workspace/treeNodes/DefinitionFileTreeNode';
import { DefinitionFileSystemProvider } from '../workspace/DefinitionFileSystemProvider';
import { ReadonlyDefinitionFileSystemProvider } from '../workspace/ReadonlyDefinitionFileSystemProvider';

/**
 * Command to open an item definition file in editable mode.
 * Switches from the readonly virtual document to the editable file system URI.
 */
export class EditItemDefinitionCommand extends FabricCommand<'item/definition/edit'> {
    public readonly commandName = commandNames.editDefinitionFile;
    public readonly telemetryEventName = 'item/definition/edit' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        const arg = args[0];

        let editableUri: vscode.Uri | undefined;
        let fileName: string | undefined;
        let artifact: IArtifact | undefined;

        // Handle two cases: called from tree node or from CodeLens/URI
        if (arg instanceof DefinitionFileTreeNode) {
            // Called from tree view context menu
            const node = arg as DefinitionFileTreeNode;
            editableUri = node.editableUri;
            fileName = node.fileName;
            artifact = node.artifact;
        }
        else if (arg?.scheme === ReadonlyDefinitionFileSystemProvider.scheme) {
            // Called from CodeLens - convert readonly URI to editable URI
            const readonlyUri = arg as vscode.Uri;
            editableUri = readonlyUri.with({ scheme: DefinitionFileSystemProvider.scheme });
            fileName = readonlyUri.path.split('/').pop() ?? undefined;
        }
        else {
            this.commandManager.logger.error('editDefinitionFile called without valid argument');
            return;
        }

        if (!editableUri) {
            this.commandManager.logger.error('editDefinitionFile: could not determine editable URI');
            return;
        }

        // Add artifact telemetry properties if available
        if (artifact) {
            this.addArtifactTelemetryProperties(telemetryActivity, artifact);
        }

        // Extract file extension for telemetry if we have fileName
        if (fileName) {
            const parts = fileName.split('.');
            const fileExtension = parts.length > 1 ? parts.pop() || '' : '';
            telemetryActivity.addOrUpdateProperties({
                fileExtension: fileExtension,
            });
        }

        // Close the readonly document if it's open
        const readonlyUri = editableUri.with({ scheme: ReadonlyDefinitionFileSystemProvider.scheme });
        const readonlyUriString = readonlyUri.toString();
        const readonlyDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === readonlyUriString);
        if (readonlyDoc) {
            await vscode.window.showTextDocument(readonlyDoc, { preview: false, preserveFocus: false });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }

        // Use vscode.open to let VS Code choose the appropriate editor
        // For .ipynb files:
        //   - If Jupyter extension is installed: opens in notebook editor
        //   - If not installed: VS Code prompts to install extension or opens as JSON
        // For other files: opens in text editor
        // This triggers DefinitionFileEditorDecorator for text files
        await vscode.commands.executeCommand('vscode.open', editableUri);

        this.commandManager.logger.debug(`Opened definition file for editing: ${fileName || editableUri.toString()}`);
    }
}
