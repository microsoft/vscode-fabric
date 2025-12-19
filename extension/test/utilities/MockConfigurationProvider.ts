// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';

/**
 * Mock implementation of IConfigurationProvider for unit tests.
 * Allows setting configuration values and manually firing configuration change events.
 */
export class MockConfigurationProvider implements IConfigurationProvider {
    private config: Map<string, any> = new Map();
    private readonly onDidConfigurationChangeEmitter = new vscode.EventEmitter<string>();
    readonly onDidConfigurationChange = this.onDidConfigurationChangeEmitter.event;

    get<T>(key: string, defaultValue: T): T {
        return this.config.has(key) ? this.config.get(key) : defaultValue;
    }

    update<T>(key: string, value: T): Thenable<void> {
        this.config.set(key, value);
        this.onDidConfigurationChangeEmitter.fire(key);
        return Promise.resolve();
    }

    /**
     * Sets a configuration value without firing a change event.
     * Useful for setting up initial test state.
     */
    setConfigValue<T>(key: string, value: T): void {
        this.config.set(key, value);
    }

    /**
     * Manually fires a configuration change event for the specified key.
     * Useful for testing event handling without actually changing the value.
     */
    fireConfigChange(key: string): void {
        this.onDidConfigurationChangeEmitter.fire(key);
    }
}
