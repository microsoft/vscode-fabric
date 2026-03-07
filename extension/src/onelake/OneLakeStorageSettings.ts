// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';

export interface OneLakeStorageConfiguration {
    endpoint?: string;
    workspaceId?: string;
    lakehouseId?: string;
}

export interface ResolvedOneLakeStorageConfiguration {
    endpoint: string;
    workspaceId: string;
    lakehouseId: string;
}

export const defaultOneLakeDfsEndpoint = 'https://onelake.dfs.fabric.microsoft.com';

export function getOneLakeStorageConfiguration(configurationProvider: IConfigurationProvider): ResolvedOneLakeStorageConfiguration {
    const config = configurationProvider.get<OneLakeStorageConfiguration>('OneLakeStorage', {
        endpoint: defaultOneLakeDfsEndpoint,
        workspaceId: '',
        lakehouseId: '',
    });

    return {
        endpoint: config.endpoint?.trim() || defaultOneLakeDfsEndpoint,
        workspaceId: config.workspaceId?.trim() || '',
        lakehouseId: config.lakehouseId?.trim() || '',
    };
}
