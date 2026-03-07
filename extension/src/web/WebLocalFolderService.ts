// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { getOneLakeStorageConfiguration } from '../onelake/OneLakeStorageSettings';
import {
    ILocalFolderService,
    LocalFolderArtifactInformation,
    LocalFolderGetOptions,
    LocalFolderGetResult,
} from '../LocalFolderService';

/**
 * Web-specific local folder service that resolves a deterministic OneLake URI.
 */
export class WebLocalFolderService implements ILocalFolderService {
    private static readonly oneLakeScheme = 'onelake';

    public constructor(
        private readonly configurationProvider: IConfigurationProvider,
        private readonly fileSystem: vscode.FileSystem
    ) {
    }

    public async getLocalFolder(
        artifact: IArtifact,
        options?: LocalFolderGetOptions
    ): Promise<LocalFolderGetResult | undefined> {
        const storage = this.getOneLakeStorageConfiguration();

        const folderUri = this.buildArtifactFolderUri(
            storage.workspaceId,
            storage.lakehouseId,
            artifact.workspaceId,
            artifact.type,
            artifact.id,
            artifact.displayName
        );

        let created = false;
        if (options?.create) {
            const exists = await this.directoryExists(folderUri);
            if (!exists) {
                await this.fileSystem.createDirectory(folderUri);
                created = true;
            }
        }

        return {
            uri: folderUri,
            prompted: false,
            created,
        };
    }

    public async updateLocalFolder(_artifact: IArtifact, _folder: vscode.Uri): Promise<void> {
        // No-op for web: destination is deterministic from configuration + artifact metadata.
    }

    public getArtifactInformation(folderUri: vscode.Uri): LocalFolderArtifactInformation | undefined {
        if (folderUri.scheme !== WebLocalFolderService.oneLakeScheme) {
            return undefined;
        }

        const segments = folderUri.path.split('/').filter(segment => segment.length > 0);

        // Expected shape:
        // /{storageWorkspaceId}/{storageLakehouseId}/fabric-definitions/{sourceWorkspaceId}/{artifactType}/{artifactId}/{displayName}.{artifactType}
        if (segments.length < 7) {
            return undefined;
        }

        if (segments[2] !== 'fabric-definitions') {
            return undefined;
        }

        return {
            artifactId: segments[5],
            workspaceId: segments[3],
        };
    }

    private getOneLakeStorageConfiguration() {
        const config = getOneLakeStorageConfiguration(this.configurationProvider);

        if (!config.workspaceId || !config.lakehouseId) {
            throw new Error('OneLake storage is not configured. Set Fabric.OneLakeStorage.workspaceId and Fabric.OneLakeStorage.lakehouseId.');
        }

        return config;
    }

    private buildArtifactFolderUri(
        storageWorkspaceId: string,
        storageLakehouseId: string,
        sourceWorkspaceId: string,
        artifactType: string,
        artifactId: string,
        displayName: string
    ): vscode.Uri {
        const storageRoot = vscode.Uri.parse(`${WebLocalFolderService.oneLakeScheme}:///${encodeURIComponent(storageWorkspaceId)}/${encodeURIComponent(storageLakehouseId)}`);

        const folderName = `${displayName}.${artifactType}`;

        return vscode.Uri.joinPath(
            storageRoot,
            'fabric-definitions',
            sourceWorkspaceId,
            artifactType,
            artifactId,
            folderName
        );
    }

    private async directoryExists(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await this.fileSystem.stat(uri);
            return stat.type === vscode.FileType.Directory;
        }
        catch {
            return false;
        }
    }
}
