// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, FabricCommandBase } from '@microsoft/vscode-fabric-util';
import { SqlSatelliteTelemetryEventNames } from './SqlSatelliteTelemetryEventNames';
import { ISqlSatelliteCommandManager } from './ISqlSatelliteCommandManager';
import { commandNames } from '../../constants';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';

/**
 * Command to copy a database connection string to the clipboard
 */
export class CopyConnectionStringCommand extends FabricCommandBase<SqlSatelliteTelemetryEventNames, 'item/copy/connection-string', ISqlSatelliteCommandManager> {
    public readonly commandName = commandNames.copyConnectionString;
    public readonly telemetryEventName = 'item/copy/connection-string' as const;

    constructor(commandManager: ISqlSatelliteCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<SqlSatelliteTelemetryEventNames>,
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
                telemetryActivity.addOrUpdateProperties({
                    workspaceId: databaseTreeNode.artifact.workspaceId,
                    artifactId: databaseTreeNode.artifact.id,
                    itemType: databaseTreeNode.artifact.type,
                    fabricArtifactName: databaseTreeNode.artifact.displayName,
                    endpoint: this.commandManager.fabricEnvironmentProvider.getCurrent().sharedUri,
                } as any);

                // Get the connection string and copy to clipboard
                const connectionString = await databaseTreeNode.getConnectionString(this.commandManager.apiClient);
                await vscode.env.clipboard.writeText(connectionString);
            }
        );
    }
}
