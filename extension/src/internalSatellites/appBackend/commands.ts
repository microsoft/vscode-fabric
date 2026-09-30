// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, TelemetryService } from '@microsoft/vscode-fabric-util';
import { AppBackendWebviewPanel } from './AppBackendWebviewPanel';

let commandDisposables: vscode.Disposable[] = [];

/**
 * Registers App Backend commands early (before full activation completes).
 * The `createRayfinApp` command works immediately; `getStarted` uses
 * a late-bound provider/telemetry that gets set once satellites activate.
 */
export function registerAppBackendCommands(
    context: vscode.ExtensionContext
): void {
    function registerCommand(
        commandName: string,
        callback: (...args: any[]) => Promise<void>
    ): void {
        const disposable = vscode.commands.registerCommand(commandName, callback);
        context.subscriptions.push(disposable);
        commandDisposables.push(disposable);
    }

    registerCommand('vscode-fabric.appBackend.getStarted', async (...cmdArgs) => {
        const treeNode = cmdArgs[0] as ArtifactTreeNode | undefined;
        if (treeNode?.artifact) {
            _telemetryService?.sendTelemetryEvent('appBackend/getStarted', {
                itemType: treeNode.artifact.type,
                result: 'Succeeded',
            });
            AppBackendWebviewPanel.show(
                treeNode.artifact,
                _fabricEnvironmentProvider,
                _telemetryService
            );
        }
    });

    registerCommand('vscode-fabric.appBackend.createRayfinApp', async () => {
        if (vscode.env.uiKind === vscode.UIKind.Web) {
            _telemetryService?.sendTelemetryEvent('appBackend/createRayfinApp', {
                result: 'Failed',
            });
            vscode.window.showErrorMessage(
                vscode.l10n.t('Creating a Rayfin app requires the desktop version of Visual Studio Code.')
            );
            return;
        }

        const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: vscode.l10n.t('Select Folder'),
            title: vscode.l10n.t('Select a folder to create your Rayfin app in'),
        });

        if (!folders || folders.length === 0) {
            _telemetryService?.sendTelemetryEvent('appBackend/createRayfinApp', {
                result: 'Canceled',
            });
            return;
        }

        try {
            const terminal = vscode.window.createTerminal({
                name: 'Create Rayfin App',
                cwd: folders[0],
            });
            terminal.show();
            terminal.sendText('npm create @microsoft/rayfin@latest');
            _telemetryService?.sendTelemetryEvent('appBackend/createRayfinApp', {
                result: 'Succeeded',
            });
        }
        catch (error) {
            _telemetryService?.sendTelemetryEvent('appBackend/createRayfinApp', {
                result: 'Failed',
            });
            throw error;
        }
    });
}

let _fabricEnvironmentProvider: IFabricEnvironmentProvider | undefined;
let _telemetryService: TelemetryService | undefined;

/**
 * Binds the late-resolved services so that commands can use them.
 * Called from AppBackendExtension after satellite activation.
 */
export function bindAppBackendServices(
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    telemetryService: TelemetryService
): void {
    _fabricEnvironmentProvider = fabricEnvironmentProvider;
    _telemetryService = telemetryService;
}

export function disposeCommands(): void {
    commandDisposables.forEach(d => d.dispose());
    commandDisposables = [];
    _fabricEnvironmentProvider = undefined;
    _telemetryService = undefined;
}
