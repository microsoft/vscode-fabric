// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Activates the web version of the Fabric extension.
 * This is a simplified entry point for browser-based VS Code environments.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Register a simple hello world command
    const helloCommand = vscode.commands.registerCommand('vscode-fabric.helloWeb', async () => {
        await vscode.window.showInformationMessage('Hello from Fabric Web Extension! Running in: ' + vscode.env.uiKind);
    });

    context.subscriptions.push(helloCommand);
}

export async function deactivate() {
    // Clean shutdown
}
