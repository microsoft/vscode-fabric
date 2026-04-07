// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryService, ILogger, withErrorHandling, doFabricAction } from '@microsoft/vscode-fabric-util';
import { ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNode } from './NotebookTreeNode';
import { openNotebookInSynapse } from './openNotebookInSynapse';

export const openNotebook = 'vscode-fabric.openNotebook';

let commandDisposables: vscode.Disposable[] = [];

export function registerNotebookCommands(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    logger: ILogger
): void {
    const callback = async (...cmdArgs: any[]) => {
        await withErrorHandling(vscode.l10n.t('Open in Synapse VS Code'), logger, telemetryService, async () => {
            await doFabricAction({ fabricLogger: logger }, async () => {
                const item = cmdArgs?.[0] as ArtifactTreeNode | undefined;
                if (!item) {
                    return;
                }

                const notebookTreeNode = item as NotebookTreeNode;

                await openNotebookInSynapse(telemetryService, notebookTreeNode);
            });
        })();
    };

    const disposable = vscode.commands.registerCommand(openNotebook, callback);
    commandDisposables.push(disposable);
}

export function disposeCommands(): void {
    commandDisposables.forEach((disposable) => disposable.dispose());
    commandDisposables = [];
}
