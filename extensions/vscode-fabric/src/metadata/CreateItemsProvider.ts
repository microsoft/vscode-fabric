import * as vscode from 'vscode';
import { ICreateItemsProvider, ItemCreationDetails, CreationCapability, FabricItemMetadata } from './definitions';
import { getArtifactDefaultIconPath, getArtifactIconPath } from './fabricItemUtilities';

export class CreateItemsProvider implements ICreateItemsProvider {
    public constructor(private readonly fabricItemMetadata: Partial<Record<string, FabricItemMetadata>>) {}

    public getItemsForCreate(baseUri: vscode.Uri): ItemCreationDetails[] {
        const items: ItemCreationDetails[] = [];
        for (const [key, value] of Object.entries(this.fabricItemMetadata)) {
            if (value?.creationCapability !== undefined && value.creationCapability !== CreationCapability.unsupported) {
                items.push({
                    type: key,
                    displayName: value.displayName ?? key,
                    description: value.creationDescription ?? vscode.l10n.t('Create a new {0}', value.displayName ?? key),
                    creationCapability: value.creationCapability,
                    iconPath: value.iconInformation ? getArtifactIconPath(baseUri, key) : getArtifactDefaultIconPath(baseUri),
                });
            }
        }
        return items;
    }
}
