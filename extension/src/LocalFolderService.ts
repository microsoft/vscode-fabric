// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionsSettingStorage, ILocalFolderSettingsStore } from './settings/definitions';
import { LocalFolderSettingsStore } from './settings/LocalFolderSettingsStore';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { isDirectory } from './utilities';

export enum LocalFolderSaveBehavior {
    prompt = 'prompt',
    always = 'always',
    never = 'never'
}

/**
 * Determines when to show the folder picker prompt for getLocalFolder.
 */
export enum LocalFolderPromptMode {
    never = 'never',
    discretionary = 'discretionary',
    always = 'always',
}

export interface LocalFolderGetOptions {
    /**
     * Controls when to show the folder picker prompt.
     * - never: never show the picker
     * - always: always show the picker
     * - discretionary: show only if no folder is set
     */
    prompt?: LocalFolderPromptMode;

    /**
     * If true, create the folder if it does not exist.
     */
    create?: boolean;
}

/**
 * Result returned by getLocalFolder, describing the outcome.
 */
export interface LocalFolderGetResult {
    /** The resolved local folder URI. */
    uri: vscode.Uri;

    /** True if a prompt was shown to the user. */
    prompted: boolean;

    /** True if the folder was created as part of this operation. */
    created: boolean;
}

/**
 * Information about an artifact associated with a local folder.
 */
export interface LocalFolderArtifactInformation {
    /** The artifact identifier */
    artifactId: string;

    /** The workspace ID that contains this artifact */
    workspaceId: string;

    /** The Fabric environment the artifact belongs to */
    fabricEnvironment?: string;
}

/**
 * Manages local folder associations for Fabric artifacts.
 */
export interface ILocalFolderService {
    /**
     * Gets the local folder URI for the specified artifact, if set, and returns details about the operation.
     * @param artifact The artifact to look up
     */
    getLocalFolder(
        artifact: IArtifact,
        options?: LocalFolderGetOptions
    ): Promise<LocalFolderGetResult | undefined>;

    /**
     * Updates the local folder association for the specified artifact.
     * @param artifact The artifact to associate
     * @param folder The local folder URI to store
     */
    updateLocalFolder(artifact: IArtifact, folder: vscode.Uri): Promise<void>;

    /**
     * Gets artifact information associated with the given folder path.
     * Useful for inferring workspace context from a local folder during import operations.
     * @param folderUri The local folder URI to look up
     * @returns Artifact information if found, undefined otherwise
     */
    getArtifactInformation(folderUri: vscode.Uri): LocalFolderArtifactInformation | undefined;
}

export class LocalFolderService implements ILocalFolderService {
    // private adapter: ILocalFolderSettingsAdapter;
    private settingsStore: ILocalFolderSettingsStore;

    public constructor(
        private storage: IFabricExtensionsSettingStorage,
        private environmentProvider: IFabricEnvironmentProvider,
        private fileSystem: vscode.FileSystem
    ) {
        // this.adapter = new LocalFolderSettingsAdapter(storage, environmentProvider);
        this.settingsStore = new LocalFolderSettingsStore(storage);
    }

    public async getLocalFolder(
        artifact: IArtifact,
        options?: LocalFolderGetOptions
    ): Promise<LocalFolderGetResult | undefined> {
        const promptMode = options?.prompt ?? LocalFolderPromptMode.discretionary;
        const createFolder = options?.create ?? false;

        // Check if we already have a local folder set for this artifact
        const existingPath = this.settingsStore.getLocalFolder(artifact.id);
        let folderUri: vscode.Uri | undefined;
        let prompted = false;
        let created = false;

        if (existingPath && promptMode !== LocalFolderPromptMode.always) {
            folderUri = vscode.Uri.file(existingPath);
        }
        else if (promptMode !== LocalFolderPromptMode.never) {
            // Show folder picker
            const dialogOptions: vscode.OpenDialogOptions = {
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: vscode.l10n.t('Select Folder'),
                title: vscode.l10n.t('Item definition will be saved to {0}.{1}', artifact.displayName, artifact.type),
            };

            // If there's an existing path, set the parent folder as the default location
            if (existingPath) {
                try {
                    const existingUri = vscode.Uri.file(existingPath);
                    dialogOptions.defaultUri = vscode.Uri.joinPath(existingUri, '..');
                }
                catch (error) {
                    // If there's any error with path manipulation, don't set a default
                }
            }

            const selectedUris = await vscode.window.showOpenDialog(dialogOptions);

            if (selectedUris && selectedUris.length > 0) {
                prompted = true;
                folderUri = vscode.Uri.joinPath(selectedUris[0], `${artifact.displayName}.${artifact.type}`);
            }
        }
        else if (existingPath) {
            // promptMode is 'never' but we have an existing path
            folderUri = vscode.Uri.file(existingPath);
        }

        if (!folderUri) {
            return undefined;
        }

        // Create the folder if requested and it doesn't exist
        if (createFolder && !(await isDirectory(this.fileSystem, folderUri))) {
            try {
                await this.fileSystem.createDirectory(folderUri);
                created = true;
            }
            catch (createError) {
                // Failed to create directory
                throw new Error(`Unable to create folder: ${createError}`);
            }
        }

        return {
            uri: folderUri,
            prompted,
            created,
        };
    }

    public async updateLocalFolder(artifact: IArtifact, folder: vscode.Uri): Promise<void> {
        await this.settingsStore.setLocalFolder(artifact.id, folder.fsPath, artifact.workspaceId, artifact.fabricEnvironment);
    }

    public getArtifactInformation(folderUri: vscode.Uri): LocalFolderArtifactInformation | undefined {
        const normalizedPath = folderUri.fsPath.trim().toLowerCase();
        const currentEnvironment = this.environmentProvider.getCurrent().env;

        // Search through localFolders to find a matching artifact
        const localFolders = this.storage.settings.localFolders || [];

        const matchingEntry = localFolders.find(entry => {
            if (!entry.localFolder) {
                return false;
            }

            // Skip entries that don't match the current Fabric environment
            if (entry.fabricEnvironment && entry.fabricEnvironment !== currentEnvironment) {
                return false;
            }

            const entryPath = entry.localFolder.trim().toLowerCase();

            // Check for exact match
            return entryPath === normalizedPath;
        });

        if (!matchingEntry) {
            return undefined;
        }

        return {
            artifactId: matchingEntry.artifactId,
            workspaceId: matchingEntry.workspaceId,
            fabricEnvironment: matchingEntry.fabricEnvironment,
        };
    }
}
