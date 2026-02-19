// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { ReadonlyDefinitionFileSystemProvider } from './ReadonlyDefinitionFileSystemProvider';

/**
 * Provides CodeLens for readonly definition files showing "Start editing" action
 */
export class DefinitionFileCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        // Only show for readonly virtual definition files
        if (document.uri.scheme !== ReadonlyDefinitionFileSystemProvider.scheme) {
            return [];
        }

        // Create a CodeLens at the top of the file
        const topOfDocument = new vscode.Range(0, 0, 0, 0);
        const codeLens = new vscode.CodeLens(topOfDocument);
        
        codeLens.command = {
            title: vscode.l10n.t('$(edit)  Start editing'),
            tooltip: vscode.l10n.t('Enable editing for this remote file'),
            command: commandNames.editDefinitionFile,
            arguments: [document.uri]
        };

        return [codeLens];
    }
}
