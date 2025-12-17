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
 * Command to open a database artifact in the SQL Extension
 */
export class OpenSqlExtensionCommand extends FabricCommand<'item/open/sql-ext'> {
    public readonly commandName = commandNames.openSqlExtension;
    public readonly telemetryEventName = 'item/open/sql-ext' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        await this.commandManager.artifactManager.doContextMenuItem(
            args,
            vscode.l10n.t('Open in SQL Extension'),
            async (item) => {
                if (!item) {
                    return;
                }

                const databaseTreeNode = item as AbstractDatabaseTreeNode;
                
                // Add telemetry properties
                this.addArtifactTelemetryProperties(telemetryActivity, databaseTreeNode.artifact);

                // Get the external URI and open it
                const targetUrl = await databaseTreeNode.getExternalUri(this.commandManager.apiClient);
                await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
            }
        );
    }
}
