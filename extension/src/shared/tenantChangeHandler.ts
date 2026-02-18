// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IAccountProvider } from '../authentication/interfaces';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';

/**
 * Creates a handler for tenant change events.
 * Updates the stored tenant information when the user switches tenants.
 */
export function createTenantChangeHandler(
    storage: IFabricExtensionsSettingStorage,
    accountProvider: IAccountProvider
): () => Promise<void> {
    return async () => {
        const tenantInformation = await accountProvider.getCurrentTenant();
        if (!tenantInformation) {
            storage.settings.currentTenant = undefined;
        }
        else {
            // Save the tenant information
            storage.settings.currentTenant = {
                tenantId: tenantInformation.tenantId,
                defaultDomain: tenantInformation.defaultDomain,
                displayName: tenantInformation.displayName,
            };
        }
        await storage.save();
    };
}
