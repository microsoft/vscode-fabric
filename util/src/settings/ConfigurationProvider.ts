// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IDisposableCollection } from '../DisposableCollection';

/**
 * Interface for managing VS Code configuration settings with type safety and change notifications.
 *
 * This interface provides a simplified, type-safe wrapper around VS Code's configuration system,
 * offering get/set operations for configuration values along with change event notifications.
 * It abstracts the complexity of VS Code's configuration API while providing automatic change
 * tracking for registered configuration keys.
 *
 * The provider automatically tracks which configuration keys have been accessed and only
 * fires change events for those specific keys, optimizing performance by avoiding unnecessary
 * event processing for unrelated configuration changes.
 *
 * @example
 * ```typescript
 * // Get a configuration value with a default
 * const timeout = configProvider.get('timeout', 5000);
 *
 * // Update a configuration value
 * await configProvider.update('enableFeature', true);
 *
 * // Listen for configuration changes
 * configProvider.onDidConfigurationChange(key => {
 *   console.log(`Configuration key '${key}' changed`);
 * });
 * ```
 */
export interface IConfigurationProvider {
    /**
     * Retrieves a configuration value with type safety and default value support.
     *
     * This method automatically registers the key for change tracking, ensuring that
     * future changes to this configuration key will trigger the onDidConfigurationChange event.
     * The returned value is strongly typed based on the provided default value.
     *
     * @template T - The type of the configuration value
     * @param key - The configuration key to retrieve (without the section prefix)
     * @param defaultValue - The default value to return if the configuration key is not set
     * @returns The configuration value of type T, or the default value if not configured
     *
     * @example
     * ```typescript
     * // Get a string configuration with default
     * const logLevel = configProvider.get('logLevel', 'info');
     *
     * // Get a boolean configuration with default
     * const enableTelemetry = configProvider.get('enableTelemetry', false);
     *
     * // Get a number configuration with default
     * const maxRetries = configProvider.get('maxRetries', 3);
     * ```
     */
    get<T>(key: string, defaultValue: T): T;

    /**
     * Updates a configuration value and persists it to the user's settings.
     *
     * This method automatically registers the key for change tracking and updates the
     * configuration value at the global scope. The update is asynchronous and returns
     * a promise that resolves when the configuration has been successfully saved.
     *
     * @template T - The type of the configuration value being set
     * @param key - The configuration key to update (without the section prefix)
     * @param value - The new value to set for the configuration key
     * @returns A promise that resolves when the configuration update is complete
     *
     * @example
     * ```typescript
     * // Update a string configuration
     * await configProvider.update('defaultWorkspace', 'MyWorkspace');
     *
     * // Update a boolean configuration
     * await configProvider.update('autoSync', true);
     *
     * // Update a complex object configuration
     * await configProvider.update('userPreferences', { theme: 'dark', fontSize: 14 });
     * ```
     */
    update<T>(key: string, value: T): Thenable<void>;

    /**
     * Event that fires when a tracked configuration key changes.
     *
     * This event only fires for configuration keys that have been previously accessed
     * via the get() or update() methods, providing efficient change notifications without
     * monitoring all configuration changes. The event provides the specific key that changed,
     * allowing subscribers to react to only the configuration changes they care about.
     *
     * @example
     * ```typescript
     * // Listen for specific configuration changes
     * configProvider.onDidConfigurationChange(key => {
     *   if (key === 'logLevel') {
     *     // Reinitialize logging with new level
     *     updateLoggingLevel();
     *   } else if (key === 'apiEndpoint') {
     *     // Reconnect to new API endpoint
     *     reconnectToApi();
     *   }
     * });
     * ```
     */
    onDidConfigurationChange: vscode.Event<string>;
}

export class ConfigurationProvider implements IConfigurationProvider {
    private section: string = 'Fabric';

    // This is a set of keys that we are tracking for changes. Will fire the onDidConfigurationChange event for each key that is changed.
    private keys: Set<string> = new Set<string>();

    private readonly onDidConfigurationChangeEmitter = new vscode.EventEmitter<string>();
    readonly onDidConfigurationChange = this.onDidConfigurationChangeEmitter.event;

    public constructor(private disposables: IDisposableCollection) {
        this.disposables.add(vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration(this.section)) {
                this.keys.forEach(key => {
                    // Only fire the event for the keys which have been changed
                    if (e.affectsConfiguration(`${this.section}.${key}`)) {
                        this.onDidConfigurationChangeEmitter.fire(key);
                    }
                });
            }
        }));
    }

    public get<T>(key: string, defaultValue: T): T {
        this.keys.add(key);
        return vscode.workspace.getConfiguration(this.section).get<T>(key, defaultValue);
    }

    public update<T>(key: string, value: T): Thenable<void> {
        this.keys.add(key);
        return vscode.workspace.getConfiguration(this.section).update(key, value, vscode.ConfigurationTarget.Global);
    }
}
