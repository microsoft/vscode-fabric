// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IFabricExtensionsSettingStorage, IFabricViewState } from '../settings/definitions';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication';

async function getContextKey(env: IFabricEnvironmentProvider, account: IAccountProvider) {
    const envName = env.getCurrent()?.env ?? 'unknown';
    const tenant = (await account.getCurrentTenant())?.tenantId ?? 'none';
    return `${envName}:${tenant}`;
}

function normalize(vs?: IFabricViewState) {
    return {
        expandedTenants: new Set(vs?.expandedTenants ?? []),
        expandedWorkspaces: new Set(vs?.expandedWorkspaces ?? []),
        expandedGroupsByWorkspace: new Map<string, Set<string>>(
            Object.entries(vs?.expandedGroupsByWorkspace ?? {}).map(([k, arr]) => [k, new Set(arr)])
        ),
    };
}

export async function makeShouldExpand(
    storage: IFabricExtensionsSettingStorage,
    env: IFabricEnvironmentProvider,
    account: IAccountProvider
): Promise<(id: string | undefined) => boolean> {
    const key = await getContextKey(env, account);
    const viewStateObj = storage.settings.viewState ?? {};
    const viewStateMap = new Map<string, IFabricViewState>(Object.entries(viewStateObj));
    const vsEntry = viewStateMap.get(key);
    const a = normalize(vsEntry);
    const tenants = a.expandedTenants;
    const workspaces = a.expandedWorkspaces;
    const groups = a.expandedGroupsByWorkspace;

    return (id?: string) => {
        if (!id) {
            return false;
        }
        if (id.startsWith('tenant:')) {
            return tenants.has(id);
        }
        if (id.startsWith('ws:')) {
            return workspaces.has(id);
        }
        if (id.startsWith('grp:')) {
            const parts = id.split(':'); // grp:tenant:wsId:artifactType
            if (parts.length >= 4) {
                const wsKey = `ws:${parts[1]}:${parts[2]}`;
                return groups.get(wsKey)?.has(id) ?? false;
            }
        }
        return false;
    };
}

export async function recordExpansionChange(
    storage: IFabricExtensionsSettingStorage,
    env: IFabricEnvironmentProvider,
    account: IAccountProvider,
    id: string,
    expand: boolean
): Promise<void> {
    const key = await getContextKey(env, account);
    const viewStateMap = new Map<string, IFabricViewState>(Object.entries(storage.settings.viewState ?? {}));
    const vs: IFabricViewState = viewStateMap.get(key) ?? { expandedTenants: [], expandedWorkspaces: [], expandedGroupsByWorkspace: {} };
    const normalized = normalize(vs);

    if (id.startsWith('tenant:')) {
        const set = normalized.expandedTenants;
        if (expand) {
            set.add(id);
        }
        else {
            set.delete(id);
        }
        // apply back to vs on save
    }
    else if (id.startsWith('ws:')) {
        const set = normalized.expandedWorkspaces;
        if (expand) {
            set.add(id);
        }
        else {
            set.delete(id);
        }
        // apply back to vs on save
    }
    else if (id.startsWith('grp:')) {
        const parts = id.split(':'); // grp:tenant:wsId:artifactType
        if (parts.length >= 4) {
            const wsKey = `ws:${parts[1]}:${parts[2]}`;
            const set = normalized.expandedGroupsByWorkspace.get(wsKey) ?? new Set<string>();
            if (expand) {
                set.add(id);
            }
            else {
                set.delete(id);
            }
            normalized.expandedGroupsByWorkspace.set(wsKey, set);
        }
    }

    // serialize normalized state back to persisted IFabricViewState shape
    const persisted: IFabricViewState = {
        expandedTenants: Array.from(normalized.expandedTenants),
        expandedWorkspaces: Array.from(normalized.expandedWorkspaces),
        expandedGroupsByWorkspace: Object.fromEntries(
            Array.from(normalized.expandedGroupsByWorkspace.entries()).map(([k, set]) => [k, Array.from(set)])
        ),
    };

    viewStateMap.set(key, persisted);
    storage.settings.viewState = Object.fromEntries(viewStateMap);
    await storage.save();
}
