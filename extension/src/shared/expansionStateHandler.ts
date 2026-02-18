// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication/interfaces';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { recordExpansionChange } from '../workspace/viewExpansionState';

/**
 * Creates a handler for tracking tree view expansion state changes.
 * Records expansion/collapse events for tenant, workspace, and group nodes.
 */
export function createExpansionStateHandler(
    storage: IFabricExtensionsSettingStorage,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    accountProvider: IAccountProvider
): (element: FabricTreeNode | undefined, expand: boolean) => Promise<void> {
    return async (element: FabricTreeNode | undefined, expand: boolean) => {
        try {
            if (!element || !('id' in element) || !element.id) {
                return;
            }
            const id = (element as any).id as string;
            if (!id.startsWith('tenant:') && !id.startsWith('ws:') && !id.startsWith('grp:')) {
                return;
            }
            await recordExpansionChange(storage, fabricEnvironmentProvider, accountProvider, id, expand);
        }
        catch { /* ignore */ }
    };
}
