// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNode } from './NotebookTreeNode';
import { openNotebookInSynapse } from './openNotebookInSynapse';

export const openNotebook = 'vscode-fabric.openNotebook';

let commandDisposables: vscode.Disposable[] = [];

export function registerNotebookCommands(
    artifactManager: IArtifactManager,
    telemetryService: TelemetryService
): void {
    const callback = async (...cmdArgs: any[]) => {
        await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Open in Synapse VS Code'), async (item) => {
            if (!cmdArgs || cmdArgs.length === 0 || !item) {
                return;
            }

            await openNotebookInSynapse(telemetryService, item.artifact);
        });
    };

    const disposable = vscode.commands.registerCommand(openNotebook, callback);
    commandDisposables.push(disposable);
}

export function disposeCommands(): void {
    commandDisposables.forEach((disposable) => disposable.dispose());
    commandDisposables = [];
}
