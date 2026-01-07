// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Manages status bar notifications for definition files to warn users that changes sync to Fabric portal.
 */
export class DefinitionFileEditorDecorator implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly shownWarnings = new Set<string>();

    constructor() {
        // Create a status bar item on the left side with high priority
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = vscode.l10n.t('$(warning) Editing Remote Fabric Definition');
        this.statusBarItem.tooltip = vscode.l10n.t('Changes to this file will be saved to the item in Microsoft Fabric portal');
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.updateStatusBar(editor);
            })
        );

        // Update status bar for currently active editor
        this.updateStatusBar(vscode.window.activeTextEditor);
    }

    /**
     * Updates the status bar visibility based on the active editor
     */
    private updateStatusBar(editor: vscode.TextEditor | undefined): void {
        if (editor && editor.document.uri.scheme === 'fabric-definition') {
            // Show status bar for editable definition files
            this.statusBarItem.show();

            // Show warning message on first open of this file
            const uri = editor.document.uri.toString();
            if (!this.shownWarnings.has(uri)) {
                this.shownWarnings.add(uri);
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('You are editing a remote definition file. Changes will be saved to the item in Microsoft Fabric portal.'),
                    { modal: true },
                    vscode.l10n.t('OK')
                );
            }
        }
        else {
            // Hide status bar for other files
            this.statusBarItem.hide();
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
