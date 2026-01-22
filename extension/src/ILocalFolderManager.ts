// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';

// Deprecation: IWorkspaceManager.getLocalFolderForFabricWorkspace
/**
 * Manages local folder associations for Fabric workspaces and artifacts.
 * @deprecated
 */
export interface ILocalFolderManager {
    /**
     * Returns the default local folder URI for the given workspace, based on user settings and tenant context.
     * @param workspace The workspace to resolve the folder for
     */
    defaultLocalFolderForFabricWorkspace(workspace: IWorkspace): vscode.Uri;

    /**
     * Gets the local folder URI for the specified workspace, if set.
     * @param workspace The workspace to look up
     */
    getLocalFolderForFabricWorkspace(workspace: IWorkspace): vscode.Uri | undefined;

    /**
     * Sets the local folder for the specified workspace.
     * @param workspace The workspace to associate
     * @param workspaceFolder The local folder URI to set
     */
    setLocalFolderForFabricWorkspace(workspace: IWorkspace, workspaceFolder: vscode.Uri): Promise<void>;

    /**
     * Gets the local folder URI for the specified artifact, if set.
     * @param artifact The artifact to look up
     */
    getLocalFolderForFabricArtifact(artifact: IArtifact): Promise<vscode.Uri | undefined>;

    /**
     * Returns the workspace ID associated with the given local folder URI, or undefined if not found.
     * @param folder The local folder URI to look up
     */
    getWorkspaceIdForLocalFolder(folder: vscode.Uri): string | undefined;
}
