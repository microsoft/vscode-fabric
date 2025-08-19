import * as vscode from 'vscode';
import { IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionsSettingStorage, ILocalFolderSettingsAdapter } from './settings/definitions';
import * as os from 'os';
import * as path from 'path';
import { LocalFolderSettingsAdapter } from './settings/LocalFolderSettingsAdapter';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';

export class LocalFolderManager {
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
}
