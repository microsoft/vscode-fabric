// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ICreateItemsProvider, ItemCreationDetails, CreationCapability, FabricItemMetadata } from './definitions';
import { getArtifactDefaultIconPath, getArtifactIconPath } from './fabricItemUtilities';

export class CreateItemsProvider implements ICreateItemsProvider {
    public constructor(
        private readonly fabricItemMetadata: Partial<Record<string, FabricItemMetadata>>,
        private readonly artifactTypeFilter?: string
    ) {}

    public getItemsForCreate(baseUri: vscode.Uri): ItemCreationDetails[] {
        const items: ItemCreationDetails[] = [];

        // If a filter is provided and exists in metadata, return only that type
        if (this.artifactTypeFilter && this.fabricItemMetadata[this.artifactTypeFilter]) {
            if (this.addItemIfCreatable(this.artifactTypeFilter, this.fabricItemMetadata[this.artifactTypeFilter], baseUri, items)) {
                return items;
            }
        }

        // Otherwise, return all creatable items
        for (const [key, value] of Object.entries(this.fabricItemMetadata)) {
            this.addItemIfCreatable(key, value, baseUri, items);
        }
        return items;
    }

    private addItemIfCreatable(type: string, metadata: FabricItemMetadata | undefined, baseUri: vscode.Uri, items: ItemCreationDetails[]): boolean {
        if (metadata?.creationCapability !== undefined && metadata.creationCapability !== CreationCapability.unsupported) {
            items.push({
                type: type,
                displayName: metadata.displayName ?? type,
                description: metadata.creationDescription ?? vscode.l10n.t('Create a new {0}', metadata.displayName ?? type),
                creationCapability: metadata.creationCapability,
                iconPath: metadata.iconInformation ? getArtifactIconPath(baseUri, type) : getArtifactDefaultIconPath(baseUri),
            });
            return true;
        }
        return false;
    }
}
