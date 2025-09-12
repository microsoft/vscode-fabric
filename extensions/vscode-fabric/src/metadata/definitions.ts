import * as vscode from 'vscode';

/**
 * Provides information about the items which can be created in the Fabric workspace.
 */
export interface ICreateItemsProvider {
    /**
     * Returns a list of items which can be created in the Fabric workspace.
     * @param baseUri The base URI for the extension. This is used to resolve the icon paths.
     */
    getItemsForCreate(baseUri: vscode.Uri): ItemCreationDetails[];
}

/**
 * Represents the status of an item's creation capability.
 */
export enum CreationCapability {
    /**
     * The item is not supported for creation.
     */
    unsupported = 0,

    /**
     * The item is supported for creation.
     */
    supported = 1,

    /**
     * The item is in preview mode and may not be fully supported.
     */
    preview = 2,
}

/**
 * Contains the details of an item that can be created in the Fabric workspace.
 */
export interface ItemCreationDetails {
    /**
     * The type of the item
     */
    type: string;

    /**
     * The display name of the item type
     */
    displayName: string;

    /**
     * The description of the item type
     */
    description: string;

    /**
     * The capability of the item type
     */
    creationCapability?: CreationCapability;

    /**
     * An icon for the item type
     */
    iconPath?: vscode.Uri | { light: vscode.Uri, dark: vscode.Uri };
}

/**
 * Represents the metadata for a Fabric item type.
 */
export interface FabricItemMetadata {
    /**
     * Whether or not the item type can be created.
     * Defaults to CreationCapability.unsupported if not specified
     */
    creationCapability?: CreationCapability; // If not specified, default to CreationStatus.unsupported

    /**
     * An explanation of the item type which could be created
     */
    creationDescription?: string;

    /**
     * A friendly name for the item type
     */
    displayName?: string;

    /**
     * A friendly name for a collection of the item type
     */
    displayNamePlural?: string;

    /**
     * The id of a satellite extension which provides additional functionality for the item type
     */
    extensionId?: string;

    /**
     * The navigation folder in the portal for the item type
     */
    portalFolder?: string;

    /**
     * The name of the file for the icon of the item type
     */
    iconInformation?: { fileName: string, isThemed?: boolean };

    /**
     * Whether the item type supports get and update item definition public API
     */
    supportsArtifactWithDefinition?: boolean;
}
