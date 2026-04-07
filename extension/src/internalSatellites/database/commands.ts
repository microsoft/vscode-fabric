// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { AbstractDatabaseTreeNode } from './AbstractDatabaseTreeNode';
import { ArtifactPropertyNames, TelemetryService, ILogger, withErrorHandling, doFabricAction } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IFabricApiClient, ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
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
    apiClient: IFabricApiClient,
    telemetryService: TelemetryService,
    logger: ILogger
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
        await withErrorHandling(vscode.l10n.t('Open in SQL Extension'), logger, telemetryService, async () => {
            await doFabricAction({ fabricLogger: logger }, async () => {
                const item = cmdArgs?.[0] as ArtifactTreeNode | undefined;
                if (!item) {
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
        })();
    }, context);

    registerCommand(copyConnectionString, async (...cmdArgs) => {
        await withErrorHandling(vscode.l10n.t('Copy Connection String'), logger, telemetryService, async () => {
            await doFabricAction({ fabricLogger: logger }, async () => {
                const item = cmdArgs?.[0] as ArtifactTreeNode | undefined;
                if (!item) {
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
        })();
    }, context);
}

export function disposeCommands(): void {
    commandDisposables.forEach((disposable) => disposable.dispose());
    commandDisposables = [];
}
