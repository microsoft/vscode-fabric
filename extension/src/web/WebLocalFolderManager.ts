// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';
import { ILocalFolderManager } from '../ILocalFolderManager';

/**
 * A no-op implementation of ILocalFolderManager for web environments.
 * Local folder operations are not supported in web contexts.
 * @deprecated
 */
export class WebLocalFolderManager implements ILocalFolderManager {
    public defaultLocalFolderForFabricWorkspace(_workspace: IWorkspace): vscode.Uri {
        throw new Error('Local folder operations are not supported in web environments.');
    }

    public getLocalFolderForFabricWorkspace(_workspace: IWorkspace): vscode.Uri | undefined {
        return undefined;
    }

    public async setLocalFolderForFabricWorkspace(_workspace: IWorkspace, _workspaceFolder: vscode.Uri): Promise<void> {
        // No-op in web environment
    }

    public async getLocalFolderForFabricArtifact(_artifact: IArtifact): Promise<vscode.Uri | undefined> {
        return undefined;
    }

    public getWorkspaceIdForLocalFolder(_folder: vscode.Uri): string | undefined {
        return undefined;
    }
}
