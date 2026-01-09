// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { DefinitionFileTreeNode } from '../workspace/treeNodes/DefinitionFileTreeNode';

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
        const node = args[0] as DefinitionFileTreeNode | undefined;
        if (!node) {
            this.commandManager.logger.error('editDefinitionFile called without a DefinitionFileTreeNode');
            return;
        }

        // Add artifact telemetry properties
        this.addArtifactTelemetryProperties(telemetryActivity, node.artifact);

        // Extract file extension for telemetry; File name may contain PII, so use only the extension
        const parts = node.fileName.split('.');
        const fileExtension = parts.length > 1 ? parts.pop() || '' : '';
        telemetryActivity.addOrUpdateProperties({
            fileExtension: fileExtension,
        });

        // Open the file using the editable URI (fabric-definition://)
        // This uses the DefinitionFileSystemProvider which supports editing
        const doc = await vscode.workspace.openTextDocument(node.editableUri);
        await vscode.window.showTextDocument(doc, { preview: false });

        this.commandManager.logger.debug(`Opened definition file for editing: ${node.fileName}`);
    }
}
