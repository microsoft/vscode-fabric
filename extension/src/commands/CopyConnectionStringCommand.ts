// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';
import { AbstractDatabaseTreeNode } from '../internalSatellites/database/AbstractDatabaseTreeNode';

/**
 * Command to copy a database connection string to the clipboard
 */
export class CopyConnectionStringCommand extends FabricCommand<'item/copy/connection-string'> {
    public readonly commandName = commandNames.copyConnectionString;
    public readonly telemetryEventName = 'item/copy/connection-string' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        await this.commandManager.artifactManager.doContextMenuItem(
            args,
            vscode.l10n.t('Copy Connection String'),
            async (item) => {
                if (!item) {
                    return;
                }

                const databaseTreeNode = item as AbstractDatabaseTreeNode;
                
                // Add telemetry properties
                this.addArtifactTelemetryProperties(telemetryActivity, databaseTreeNode.artifact);

                // Get the connection string and copy to clipboard
                const connectionString = await databaseTreeNode.getConnectionString(this.commandManager.apiClient);
                await vscode.env.clipboard.writeText(connectionString);
            }
        );
    }
}
