import * as vscode from 'vscode';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNode } from './NotebookTreeNode';
import { openNotebookInSynapse } from './openNotebookInSynapse';

export const openNotebook = 'vscode-fabric.openNotebook';

let commandDisposables: vscode.Disposable[] = [];

export function registerNotebookCommands(
    context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    telemetryService: TelemetryService,
): void {
    const callback = async (...cmdArgs: any[]) => {
        await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Open in Synapse VS Code'), async (item) => {
            if (!cmdArgs || cmdArgs.length === 0 || !item) {
                return;
            }

            const notebookTreeNode = item as NotebookTreeNode;                        
            const workspaceId = notebookTreeNode.artifact.workspaceId;            

            await openNotebookInSynapse(telemetryService, notebookTreeNode);
        });
    };

    const disposable = vscode.commands.registerCommand(openNotebook, callback);
    commandDisposables.push(disposable);
}

export function disposeCommands(): void {
    commandDisposables.forEach((disposable) => disposable.dispose());
    commandDisposables = [];
}