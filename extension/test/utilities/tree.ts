// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export async function findTreeViewItem(provider: any, parent: any, label: string): Promise<any> {
    if (!provider) {
        return undefined;
    }
    const children = await provider.getChildren(parent);
    if (!children) {
        return undefined;
    }
    for (const child of children) {
        if (child.label === label) {
            return child;
        }
        const found = await findTreeViewItem(provider, child, label);
        if (found) {
            return found;
        }
    }
    return undefined;
}
