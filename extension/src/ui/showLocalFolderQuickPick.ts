// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IWorkspace } from '@microsoft/vscode-fabric-api';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

const selectFolderText = vscode.l10n.t('Select the working directory for Fabric workspace');
export async function showLocalFolderQuickPick(
    folderPath: vscode.Uri,
    currentWorkspace: IWorkspace,
    gitOperator: IGitOperator
): Promise<vscode.Uri | undefined> {
    return undefined;
}
