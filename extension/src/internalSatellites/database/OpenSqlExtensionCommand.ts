// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, FabricCommandBase } from '@microsoft/vscode-fabric-util';
import { SqlSatelliteTelemetryEventNames } from './SqlSatelliteTelemetryEventNames';
import { ISqlSatelliteCommandManager } from './ISqlSatelliteCommandManager';
import { commandNames } from '../../constants';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';

/**
 * Command to open a database artifact in the SQL Extension
 */
export class OpenSqlExtensionCommand extends FabricCommandBase<SqlSatelliteTelemetryEventNames, 'item/open/sql-ext', ISqlSatelliteCommandManager> {
    public readonly commandName = commandNames.openSqlExtension;
    public readonly telemetryEventName = 'item/open/sql-ext' as const;

    constructor(commandManager: ISqlSatelliteCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<SqlSatelliteTelemetryEventNames>,
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
                telemetryActivity.addOrUpdateProperties({
                    workspaceId: databaseTreeNode.artifact.workspaceId,
                    artifactId: databaseTreeNode.artifact.id,
                    itemType: databaseTreeNode.artifact.type,
                    fabricArtifactName: databaseTreeNode.artifact.displayName,
                    endpoint: this.commandManager.fabricEnvironmentProvider.getCurrent().sharedUri,
                } as any);

                // Get the external URI and open it
                const targetUrl = await databaseTreeNode.getExternalUri(this.commandManager.apiClient);
                await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
            }
        );
    }
}
