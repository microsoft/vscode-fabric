// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '../index';

/**
 * Base interface for commands that a command manager can execute
 */
export interface IFabricCommandBase<TEventName extends string = string> {
    readonly commandName: string;
    readonly telemetryEventName: TEventName;
    execute(...args: any[]): Promise<any>;
}

/**
 * Base interface for a command manager that handles command registration and execution
 * This interface contains only the core dependencies that are common across all contexts
 */
export interface IFabricCommandManagerBase {
    // Core dependencies available to all command managers
    readonly logger: ILogger;
    readonly telemetryService: TelemetryService | null;
    readonly extensionContext: vscode.ExtensionContext;
    readonly fabricEnvironmentProvider: IFabricEnvironmentProvider;

    // Lifecycle methods
    initialize?(): Promise<void>;
    dispose(): void;
}
