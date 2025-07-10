import * as vscode from 'vscode';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { ArtifactPropertyNames, TelemetryService } from '@fabric/vscode-fabric-util';
import { IWorkspaceManager, IArtifactManager, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { openSqlExtensionInExternal } from './openSqlExtension';
import { copyConnectionStringToClipboard } from './copyConnectionString';

export const openSqlExtension = 'vscode-fabric.openSqlExtension';
export const copyConnectionString = 'vscode-fabric.copyConnectionString';

/* eslint-disable @typescript-eslint/naming-convention */
type TelemetryEventNames = {
    'item/open/sql-ext': { properties: ArtifactPropertyNames; measurements: never },
    'item/copy/connection-string': { properties: ArtifactPropertyNames; measurements: never }
};

let commandDisposables: vscode.Disposable[] = [];

export function registerDatabaseCommands(
    context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    apiClient: IFabricApiClient,
    telemetryService: TelemetryService,
): void {
    function registerCommand(
        commandName: string,
        callback: (...args: any[]) => Promise<void>,
        context: vscode.ExtensionContext
    ): void {
        const disposable = vscode.commands.registerCommand(commandName, callback);
        context.subscriptions.push(disposable);
        commandDisposables.push(disposable);
    }

    registerCommand(openSqlExtension, async (...cmdArgs) => {
        await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Open in SQL Extension'), async (item) => {
            if (!cmdArgs || cmdArgs.length === 0 || !item) {
                return;
            }
            const databaseTreeNode = item as AbstractDatabaseTreeNode;
            await openSqlExtensionInExternal(
                telemetryService,
                workspaceManager,
                apiClient,
                databaseTreeNode
            );
        });
    }, context);

    registerCommand(copyConnectionString, async (...cmdArgs) => {
        await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Copy Connection String'), async (item) => {
            if (!cmdArgs || cmdArgs.length === 0 || !item) {
                return;
            }
            const databaseTreeNode = item as AbstractDatabaseTreeNode;
            await copyConnectionStringToClipboard(
                telemetryService,
                workspaceManager,
                apiClient,
                databaseTreeNode
            );
        });
    }, context);
}

export function disposeCommands(): void {
    commandDisposables.forEach((disposable) => disposable.dispose());
    commandDisposables = [];
}
