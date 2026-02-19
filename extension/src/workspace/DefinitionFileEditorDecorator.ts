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

        // Listen for active editor changes (text editors)
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.updateStatusBar(editor);
            })
        );

        // Listen for active notebook editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(editor => {
                this.updateStatusBarForNotebook(editor);
            })
        );

        // Update status bar for currently active editor
        this.updateStatusBar(vscode.window.activeTextEditor);
        this.updateStatusBarForNotebook(vscode.window.activeNotebookEditor);
    }

    /**
     * Shows warning message on first open of a file
     */
    private showWarningIfNeeded(uri: vscode.Uri): void {
        const uriString = uri.toString();
        if (!this.shownWarnings.has(uriString)) {
            this.shownWarnings.add(uriString);
            void vscode.window.showInformationMessage(
                vscode.l10n.t('You are editing a remote definition file. Changes will be saved to the item in Microsoft Fabric portal.'),
                { modal: true },
                vscode.l10n.t('OK')
            );
        }
    }

    /**
     * Checks if any fabric-definition editor is currently active
     */
    private hasActiveFabricDefinitionEditor(): boolean {
        const hasTextEditor = vscode.window.activeTextEditor?.document.uri.scheme === 'fabric-definition';
        const hasNotebookEditor = vscode.window.activeNotebookEditor?.notebook.uri.scheme === 'fabric-definition';
        return hasTextEditor || hasNotebookEditor;
    }

    /**
     * Updates the status bar visibility based on the active notebook editor
     */
    private updateStatusBarForNotebook(editor: vscode.NotebookEditor | undefined): void {
        if (editor && editor.notebook.uri.scheme === 'fabric-definition') {
            this.statusBarItem.show();
            this.showWarningIfNeeded(editor.notebook.uri);
        }
        else if (!this.hasActiveFabricDefinitionEditor()) {
            this.statusBarItem.hide();
        }
    }

    /**
     * Updates the status bar visibility based on the active editor
     */
    private updateStatusBar(editor: vscode.TextEditor | undefined): void {
        if (editor && editor.document.uri.scheme === 'fabric-definition') {
            this.statusBarItem.show();
            this.showWarningIfNeeded(editor.document.uri);
        }
        else if (!this.hasActiveFabricDefinitionEditor()) {
            this.statusBarItem.hide();
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }
}
