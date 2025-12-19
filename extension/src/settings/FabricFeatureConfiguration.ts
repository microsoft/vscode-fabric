// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';

/**
 * Interface for managing Fabric feature configuration settings.
 *
 * This interface provides type-safe access to feature-specific configuration settings
 * and emits dedicated events when individual settings change. It serves as a centralized
 * way to check feature flags and preview settings across the extension.
 *
 * @example
 * ```typescript
 * // Check if a feature is enabled
 * if (featureConfig.isFolderGroupingEnabled()) {
 *   // Show folders in tree view
 * }
 *
 * // React to specific feature changes
 * featureConfig.onDidFolderGroupingChange(() => {
 *   treeView.refresh();
 * });
 * ```
 */
export interface IFabricFeatureConfiguration {
    /**
     * Event that fires when the folder grouping configuration changes.
     *
     * Subscribers can use this to react to changes in the ShowFolders setting,
     * such as refreshing the tree view to show or hide folder grouping.
     */
    readonly onDidFolderGroupingChange: vscode.Event<void>;

    /**
     * Event that fires when the item definitions display configuration changes.
     *
     * Subscribers can use this to react to changes in the ShowItemDefinitions setting,
     * such as refreshing the tree view to show or hide definition file nodes.
     */
    readonly onDidItemDefinitionsChange: vscode.Event<void>;

    /**
     * Checks if folder grouping is enabled in the workspace view.
     *
     * When enabled, workspace items are organized into folders in the tree view.
     * This is a preview feature that defaults to disabled.
     *
     * @returns true if folder grouping is enabled, false otherwise
     */
    isFolderGroupingEnabled(): boolean;

    /**
     * Checks if item definitions should be displayed as expandable nodes.
     *
     * When enabled, artifacts that support item definitions will show their
     * definition files as expandable child nodes in the tree view.
     * This is a preview feature that defaults to disabled.
     *
     * @returns true if item definitions should be displayed, false otherwise
     */
    isItemDefinitionsEnabled(): boolean;
}

/**
 * Implementation of IFabricFeatureConfiguration that wraps ConfigurationProvider
 * to provide feature-specific configuration access and change events.
 */
export class FabricFeatureConfiguration implements IFabricFeatureConfiguration {
    private static readonly showFoldersKey = 'ShowFolders';
    private static readonly showItemDefinitionsKey = 'ShowItemDefinitions';

    private readonly onDidFolderGroupingChangeEmitter = new vscode.EventEmitter<void>();
    private readonly onDidItemDefinitionsChangeEmitter = new vscode.EventEmitter<void>();

    readonly onDidFolderGroupingChange = this.onDidFolderGroupingChangeEmitter.event;
    readonly onDidItemDefinitionsChange = this.onDidItemDefinitionsChangeEmitter.event;

    constructor(private readonly configurationProvider: IConfigurationProvider) {
        // Subscribe to configuration changes and fire specific events
        configurationProvider.onDidConfigurationChange(key => {
            if (key === FabricFeatureConfiguration.showFoldersKey) {
                this.onDidFolderGroupingChangeEmitter.fire();
            }
            else if (key === FabricFeatureConfiguration.showItemDefinitionsKey) {
                this.onDidItemDefinitionsChangeEmitter.fire();
            }
        });
    }

    public isFolderGroupingEnabled(): boolean {
        return this.configurationProvider.get(FabricFeatureConfiguration.showFoldersKey, false);
    }

    public isItemDefinitionsEnabled(): boolean {
        return this.configurationProvider.get(FabricFeatureConfiguration.showItemDefinitionsKey, false);
    }
}
