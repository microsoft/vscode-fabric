// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { formatErrorResponse } from './utilities';
import { FabricError } from '@microsoft/vscode-fabric-util';

export type CapacityState = 'Active' | 'Inactive';

export interface ICapacity {
    displayName: string;
    id: string;
    region: string;
    sku: string;
    state: CapacityState;
}

export interface ICapacityManager {
    listCapacities(): Promise<ICapacity[]>;
}

export class CapacityManager implements ICapacityManager {
    constructor(private readonly apiClient: IFabricApiClient) {
    };

    async listCapacities(): Promise<ICapacity[]> {
        const requestCapacities: IApiClientRequestOptions = {
            method: 'GET',
            pathTemplate: '/v1/capacities',
        };

        const response: IApiClientResponse = await this.apiClient.sendRequest(requestCapacities);

        if (response.status === 200) {
            const capacities: ICapacity[] = response.parsedBody.value.map((item: any) => ({
                id: item.id,
                displayName: item.displayName,
                sku: item.sku,
                region: item.region,
                state: item.state as CapacityState,
            }));
            return capacities;
        }
        else {
            throw new FabricError(
                formatErrorResponse(vscode.l10n.t('Unable to list capacities'), response),
                response.parsedBody?.errorCode || 'Error listing capacities'
            );
        }
    }
}
