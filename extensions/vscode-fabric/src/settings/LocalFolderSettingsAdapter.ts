import { IFabricEnvironmentProvider } from '@fabric/vscode-fabric-util';
import { IFabricArtifactSettings, IFabricExtensionsSettingStorage, IFabricWorkspaceSettings, ILocalFolderSettingsAdapter } from './definitions';

/**
 * Reads and writes local folder information of artifacts and workspace
 */
export class LocalFolderSettingsAdapter implements ILocalFolderSettingsAdapter {
    constructor(private storage: IFabricExtensionsSettingStorage, private environmentProvider: IFabricEnvironmentProvider) {
    }

    // #region ILocalFolderSettingsAdapter implementation
    containsWorkspace(id: string): boolean {
        return !!this.findWorkspace(id);
    }

    getWorkspaceFolder(id: string): string | undefined {
        const result = this.findWorkspace(id)?.localFolder?.toString();
        return result;
    }

    async setWorkspaceFolder(id: string, path: string): Promise<void> {
        const current: IFabricWorkspaceSettings | undefined = this.findWorkspace(id);
        if (current) {
            current.localFolder = path;
        }
        else {
            this.storage.settings.workspaces.push({ workspaceId: id, localFolder: path, fabricEnv: this.environmentProvider.getCurrent().env });
        }
        await this.storage.save();
    }

    containsArtifact(id: string): boolean {
        return !!this.findArtifact(id);
    }

    getArtifactFolder(id: string): string | undefined {
        const result = this.findArtifact(id)?.localFolder?.toString();
        return result;
    }

    async setArtifactFolder(id: string, path: string): Promise<void> {
        const current: IFabricArtifactSettings | undefined = this.findArtifact(id);
        if (current) {
            current.localFolder = path;
        }
        else {
            this.storage.settings.artifacts.push({ artifactId: id, localFolder: path });
        }
        await this.storage.save();
    }
    // #endregion

    private findWorkspace(id: string): IFabricWorkspaceSettings | undefined {
        const result = this.storage.settings.workspaces.find((elem) => elem.workspaceId === id);
        return result;
    }

    private findArtifact(id: string): IFabricArtifactSettings | undefined {
        const result = this.storage.settings.artifacts?.find((elem) => elem.artifactId === id);
        return result;
    }
}
