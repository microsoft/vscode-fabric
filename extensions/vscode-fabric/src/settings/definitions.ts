import { ITenantSettings } from '@fabric/vscode-fabric-util';

export const fabricWorkspaceSettingsVersion = 7; // bump this to ensure no prior value used. Allows breaking changes and bug fixes

/**
 * Contains information for a Fabric workspace
 */
export interface IFabricWorkspaceSettings {
    /**
     * The workspace identifier, considered to be unique across all workspaces and environments
     */
    workspaceId: string,

    /**
     * The Fabric tenant the workspace belongs to
     */
    tenantId?: string,

    /**
     * The Fabric environment the workspace has been created in
     */
    fabricEnv: string,

    /**
     * The local folder location for all artifact projects within the workspace
     */
    localFolder?: string
}

/**
 * Contains information for a Fabric artifact
 */
export interface IFabricArtifactSettings {
    /**
     * The item identifier
     */
    artifactId: string,

    /**
     * The relative local folder for this item within the workspace's local folder
     */
    localFolder?: string
}

/**
 * A collection of all settings for the Fabric extension
 */
export interface IFabricExtensionSettings {
    /**
     * The version of the settings
     */
    version: number,

    /**
     * Tracks if the user is currently logged into Fabric. Used to automatically log in the user in subsequent VS Code sessions.
     */
    loginState?: boolean,

    /**
     * A collection of all known Workspace settings
     */
    workspaces: IFabricWorkspaceSettings[],

    /**
     * A collection of all known Artifact settings
     */
    artifacts: IFabricArtifactSettings[],

    /**
     * The user's preferred display style for the tree view
     */
    displayStyle?: string,

    /**
     * Tenant-specific settings (present only after the user switches from their home tenant)
     */
    currentTenant?: ITenantSettings
}

/**
 * Provides a means to persist fabric settings
 */
export interface IFabricExtensionsSettingStorage {
    /**
     * The current Fabric extension settings
     */
    settings: IFabricExtensionSettings;

    /**
     * The id of the most recently opened workspace for the current Fabric environment
     */
    mostRecentWorkspace: string | undefined, // Workspace id of the most recently opened workspace

    /**
     * The user's default local location for Fabric workspaces
     */
    get defaultWorkspacesPath(): string | undefined;

    /**
     * Reads the settings from storage
     */
    load(): Promise<boolean>;

    /**
     * Writes the settings to storage
     */
    save(): Promise<void>;
}

/**
 * Reads and writes local folder information of artifacts and workspace
 */
export interface ILocalFolderSettingsAdapter {
    /**
     * Returns true if the settings contains information about the requested item
     * @param id The identifier of the item requested
     */
    containsArtifact(id: string): boolean;

    /**
     * Returns true if the settings contains information about the requested workspace
     * @param id The identifier of the workspace requested
     */
    containsWorkspace(id: string): boolean;

    /**
     * Returns the local folder information for the requested item, or undefined if no local folder information is known
     * @param id The identifier of the item requested
     */
    getArtifactFolder(id: string): string | undefined;

    /**
     * Returns the local folder information for the requested workspace, or undefined if no local folder information is known
     * @param id The identifier of the workspace requested
     */
    getWorkspaceFolder(id: string): string | undefined;

    /**
     * Sets the local folder information for the specified item, overwriting any previous value
     * @param id The identifier of the relevant item
     * @param path Local folder information for the item
     */
    setArtifactFolder(id: string, path: string): Promise<void>;

    /**
     * Sets the local folder information for the specified workspace, overwriting any previous value
     * @param id The identifier of the relevant workspace
     * @param path Local folder information for the workspace
     */
    setWorkspaceFolder(id: string, path: string): Promise<void>;
}
