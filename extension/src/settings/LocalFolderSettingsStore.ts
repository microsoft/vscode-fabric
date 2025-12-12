// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IFabricExtensionsSettingStorage, ILocalFolderSettingsStore } from './definitions';

/**
 * Manages local folder settings for artifacts using the settings storage.
 */
export class LocalFolderSettingsStore implements ILocalFolderSettingsStore {
    constructor(private storage: IFabricExtensionsSettingStorage) {
    }

    getLocalFolder(artifactId: string): string | undefined {
        const artifact = this.storage.settings.localFolders?.find(a => a.artifactId === artifactId);
        return artifact?.localFolder;
    }

    async setLocalFolder(artifactId: string, path: string, workspaceId: string, fabricEnvironment?: string): Promise<void> {
        if (!this.storage.settings.localFolders) {
            this.storage.settings.localFolders = [];
        }

        const existingArtifact = this.storage.settings.localFolders?.find(a => a.artifactId === artifactId);
        if (existingArtifact) {
            existingArtifact.localFolder = path;
            existingArtifact.workspaceId = workspaceId;
            existingArtifact.fabricEnvironment = fabricEnvironment;
        }
        else {
            this.storage.settings.localFolders.push({
                artifactId,
                localFolder: path,
                workspaceId,
                fabricEnvironment,
            });
        }

        await this.storage.save();
    }
}
