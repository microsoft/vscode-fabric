// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IWorkspace } from '@microsoft/vscode-fabric-api';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

export async function showLocalFolderQuickPick(
    folderPath: vscode.Uri,
    currentWorkspace: IWorkspace,
    gitOperator: IGitOperator
): Promise<vscode.Uri | undefined> {
    return undefined;
}
