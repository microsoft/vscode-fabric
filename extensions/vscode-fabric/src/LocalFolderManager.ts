import * as vscode from 'vscode';
import { IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionsSettingStorage, ILocalFolderSettingsAdapter } from './settings/definitions';
import * as os from 'os';
import * as path from 'path';
import { LocalFolderSettingsAdapter } from './settings/LocalFolderSettingsAdapter';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';

/**
 * Manages local folder associations for Fabric workspaces and artifacts.
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

export class LocalFolderManager implements ILocalFolderManager {
    private adapter: ILocalFolderSettingsAdapter;

    public constructor(private storage: IFabricExtensionsSettingStorage, environmentProvider: IFabricEnvironmentProvider) {
        this.adapter = new LocalFolderSettingsAdapter(storage, environmentProvider);
    }

    public defaultLocalFolderForFabricWorkspace(workspace: IWorkspace): vscode.Uri {
        // Resolve base folder (user-configured or ~/Workspaces)
        const baseFolder: string = (this.storage.defaultWorkspacesPath && this.storage.defaultWorkspacesPath.length > 0)
            ? this.storage.defaultWorkspacesPath
            : path.resolve(os.homedir(), 'Workspaces');

        // If a tenant is selected, include its display name as an additional path segment
        const tenantDisplayName: string | undefined = this.storage.settings.currentTenant?.displayName;
        const pathSegments: string[] = tenantDisplayName && tenantDisplayName.length > 0
            ? [tenantDisplayName, workspace.displayName]
            : [workspace.displayName];

        return vscode.Uri.joinPath(vscode.Uri.file(baseFolder), ...pathSegments);
    }

    public getLocalFolderForFabricWorkspace(workspace: IWorkspace): vscode.Uri | undefined {
        const workspaceFolder = this.adapter.getWorkspaceFolder(workspace.objectId);
        if (!workspaceFolder) {
            return undefined;
        }
        return vscode.Uri.file(workspaceFolder);
    }

    public async setLocalFolderForFabricWorkspace(workspace: IWorkspace, workspaceFolder: vscode.Uri): Promise<void> {
        await this.adapter.setWorkspaceFolder(workspace.objectId, workspaceFolder.fsPath);
    }

    public async getLocalFolderForFabricArtifact(artifact: IArtifact): Promise<vscode.Uri | undefined> {
        const workspaceFolder: string | undefined = this.adapter.getWorkspaceFolder(artifact.workspaceId);
        if (!workspaceFolder) {
            return undefined;
        }

        let artifactFolder: string | undefined = this.adapter.getArtifactFolder(artifact.id);
        if (!artifactFolder || artifactFolder.length === 0) {
            artifactFolder = artifact.displayName;
            await this.adapter.setArtifactFolder(artifact.id, artifactFolder);
        }

        const localFolder: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceFolder), `${artifact.displayName}.${artifact.type}`);
        return localFolder;
    }

    /**
     * Returns the workspace ID associated with the given local folder path, or undefined if not found
     * @param folder The local folder path to look up
     */
    public getWorkspaceIdForLocalFolder(folder: vscode.Uri): string | undefined {
        // Use fsPath for comparison
        return this.adapter.getWorkspaceFromFolder(folder.fsPath);
    }
}
