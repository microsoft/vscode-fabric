// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricEnvironmentName } from './FabricEnvironment';

export const msSessionProvider: string = 'microsoft';
export const msSessionProviderPPE: string = 'microsoft-sovereign-cloud';

export function getSessionProviderForFabricEnvironment(env: FabricEnvironmentName): string {
    switch (env) {
        case FabricEnvironmentName.MOCK:
        case FabricEnvironmentName.ONEBOX:
        case FabricEnvironmentName.EDOG:
        case FabricEnvironmentName.EDOGONEBOX:
            return msSessionProviderPPE;
        case FabricEnvironmentName.DAILY:
        case FabricEnvironmentName.DXT:
        case FabricEnvironmentName.MSIT:
        case FabricEnvironmentName.PROD:
            return msSessionProvider;
        default:
            throw new Error(`Unknown FabricEnvironment: ${env}`);
    }
}
