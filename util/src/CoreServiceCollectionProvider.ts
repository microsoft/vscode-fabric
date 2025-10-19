// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';

/**
 * Interface for accessing the core Fabric extension service collection.
 * Provides a way to retrieve the main service collection instance.
 */
export interface ICoreServiceCollectionProvider {
    /**
     * Gets the core Fabric extension service collection.
     * @returns The service collection instance
     */
    getCollection(): IFabricExtensionServiceCollection;
}

export class CoreServiceCollectionProvider implements ICoreServiceCollectionProvider {
    private _collection: IFabricExtensionServiceCollection | undefined;

    public getCollection(): IFabricExtensionServiceCollection {
        if (!this._collection) {
            throw new Error('service collection has not been set');
        }
        return this._collection;
    }

    public setCollection(collection: IFabricExtensionServiceCollection): void {
        this._collection = collection;
    }
}
