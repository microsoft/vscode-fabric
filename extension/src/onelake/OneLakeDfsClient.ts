// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { stringToUint8Array } from '../bufferUtilities';
import { succeeded } from '../utilities';
import { getOneLakeStorageConfiguration } from './OneLakeStorageSettings';

export interface OneLakePathProperties {
    isDirectory: boolean;
    size: number;
}

export interface OneLakeDirectoryEntry {
    name: string;
    isDirectory: boolean;
    size: number;
}

export class OneLakeDfsClient {
    public constructor(
        private readonly apiClient: IFabricApiClient,
        private readonly configurationProvider: IConfigurationProvider
    ) {
    }

    public async readFile(workspaceId: string, lakehouseId: string, filePath: string): Promise<Uint8Array> {
        const response = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, filePath),
            method: 'GET',
            streamResponseStatusCodes: new Set([200]),
        });

        if (!succeeded(response)) {
            throw new Error(`OneLake readFile failed with status ${response.status}`);
        }

        const browserStream = (response.response as any)?.browserStreamBody as ReadableStream<Uint8Array> | undefined;
        if (browserStream) {
            return await this.readBrowserStream(browserStream);
        }

        if (response.bodyAsText !== undefined) {
            return stringToUint8Array(response.bodyAsText);
        }

        return new Uint8Array(0);
    }

    public async createDirectory(workspaceId: string, lakehouseId: string, directoryPath: string): Promise<void> {
        const response = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, directoryPath, { resource: 'directory' }),
            method: 'PUT',
        });

        if (response.status === 409) {
            // ADLS Gen2 returns 409 Conflict when the target directory already exists.
            return;
        }

        if (!succeeded(response)) {
            throw new Error(`OneLake createDirectory failed with status ${response.status}`);
        }
    }

    public async getPathProperties(workspaceId: string, lakehouseId: string, path: string): Promise<OneLakePathProperties | undefined> {
        const response = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, path),
            method: 'HEAD',
        });

        if (response.status === 404) {
            return undefined;
        }

        if (!succeeded(response)) {
            throw new Error(`OneLake getPathProperties failed with status ${response.status}`);
        }

        const resourceType = response.headers?.get('x-ms-resource-type') || 'file';
        const contentLengthHeader = response.headers?.get('content-length') || '0';
        const size = Number.parseInt(contentLengthHeader, 10);

        return {
            isDirectory: resourceType.toLowerCase() === 'directory',
            size: Number.isNaN(size) ? 0 : size,
        };
    }

    public async listDirectory(workspaceId: string, lakehouseId: string, directoryPath: string): Promise<OneLakeDirectoryEntry[]> {
        const response = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, '', {
                resource: 'filesystem',
                directory: directoryPath,
                recursive: 'false',
            }),
            method: 'GET',
        });

        if (!succeeded(response)) {
            throw new Error(`OneLake listDirectory failed with status ${response.status}`);
        }

        const paths = Array.isArray(response.parsedBody?.paths) ? response.parsedBody.paths : [];
        const normalizedDirectoryPath = directoryPath.replace(/^\/+|\/+$/g, '');

        return paths
            .map((entry: any) => {
                const fullName = `${entry.name || ''}`;
                const relativeName = this.getRelativeEntryName(normalizedDirectoryPath, fullName);
                if (!relativeName || relativeName.includes('/')) {
                    return undefined;
                }

                const contentLength = Number.parseInt(`${entry.contentLength ?? '0'}`, 10);
                return {
                    name: relativeName,
                    isDirectory: `${entry.isDirectory}`.toLowerCase() === 'true',
                    size: Number.isNaN(contentLength) ? 0 : contentLength,
                } as OneLakeDirectoryEntry;
            })
            .filter((entry: OneLakeDirectoryEntry | undefined): entry is OneLakeDirectoryEntry => !!entry);
    }

    public async writeFile(workspaceId: string, lakehouseId: string, filePath: string, content: Uint8Array): Promise<void> {
        const createResponse = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, filePath, { resource: 'file' }),
            method: 'PUT',
        });

        if (!succeeded(createResponse)) {
            throw new Error(`OneLake writeFile (create) failed with status ${createResponse.status}`);
        }

        if (content.length > 0) {
            const appendResponse = await this.apiClient.sendRequest({
                url: this.buildFileUrl(workspaceId, lakehouseId, filePath, { action: 'append', position: '0' }),
                method: 'PATCH',
                body: content,
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'content-type': 'application/octet-stream',
                },
            });

            if (!succeeded(appendResponse)) {
                throw new Error(`OneLake writeFile (append) failed with status ${appendResponse.status}`);
            }
        }

        const flushResponse = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, filePath, { action: 'flush', position: content.length.toString() }),
            method: 'PATCH',
        });

        if (!succeeded(flushResponse)) {
            throw new Error(`OneLake writeFile (flush) failed with status ${flushResponse.status}`);
        }
    }

    public async deletePath(workspaceId: string, lakehouseId: string, path: string, recursive: boolean): Promise<void> {
        const response = await this.apiClient.sendRequest({
            url: this.buildFileUrl(workspaceId, lakehouseId, path, { recursive: recursive ? 'true' : 'false' }),
            method: 'DELETE',
        });

        if (response.status === 404) {
            return;
        }

        if (!succeeded(response)) {
            throw new Error(`OneLake deletePath failed with status ${response.status}`);
        }
    }

    private buildFileUrl(
        workspaceId: string,
        lakehouseId: string,
        filePath: string,
        query?: Record<string, string>
    ): string {
        const baseEndpoint = this.getDfsEndpoint().replace(/\/+$/, '');
        const normalizedPath = filePath.split('/').filter(segment => segment.length > 0).map(encodeURIComponent).join('/');
        const encodedWorkspaceId = encodeURIComponent(workspaceId);
        const encodedLakehouseId = encodeURIComponent(lakehouseId);
        const pathSuffix = normalizedPath ? `/${normalizedPath}` : '';

        const url = new URL(`${baseEndpoint}/${encodedWorkspaceId}/${encodedLakehouseId}/Files${pathSuffix}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                url.searchParams.set(key, value);
            }
        }

        return url.toString();
    }

    private getDfsEndpoint(): string {
        const config = getOneLakeStorageConfiguration(this.configurationProvider);
        return config.endpoint;
    }

    private getRelativeEntryName(directoryPath: string, fullName: string): string {
        const normalizedFullName = fullName.replace(/^\/+|\/+$/g, '');
        if (!directoryPath) {
            return normalizedFullName;
        }

        if (normalizedFullName === directoryPath) {
            return '';
        }

        const prefix = `${directoryPath}/`;
        if (normalizedFullName.startsWith(prefix)) {
            return normalizedFullName.slice(prefix.length);
        }

        return normalizedFullName;
    }

    private async readBrowserStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            if (value) {
                chunks.push(value);
                totalLength += value.length;
            }
        }

        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }
}
