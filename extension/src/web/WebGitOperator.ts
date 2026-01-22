// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

/**
 * A no-op implementation of IGitOperator for web environments.
 * Git operations requiring child_process are not supported in web contexts.
 */
export class WebGitOperator implements IGitOperator {
    public async cloneRepository(_url: string, _destinationPath: vscode.Uri, _branchName?: string): Promise<vscode.Uri | undefined> {
        await vscode.window.showWarningMessage(
            vscode.l10n.t('Git clone is not available in web environments.')
        );
        return undefined;
    }
}
