// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IFabricCommandManagerBase, IFabricCommandBase } from './IFabricCommandManagerBase';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '../index';

/**
 * Generic implementation of a command manager that handles command registration,
 * dependency injection, and lifecycle management.
 * 
 * This can be used by any context (main extension, satellites, etc.) that needs
 * to manage commands with the base dependencies.
 * 
 * For more complex scenarios, extend this class or implement IFabricCommandManagerBase directly.
 */
export class FabricCommandManager implements IFabricCommandManagerBase {
    private readonly commands = new Map<string, IFabricCommandBase>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        public readonly logger: ILogger,
        public readonly telemetryService: TelemetryService | null,
        public readonly extensionContext: vscode.ExtensionContext,
        public readonly fabricEnvironmentProvider: IFabricEnvironmentProvider
    ) {}

    /**
     * Register a command with VS Code
     */
    public registerCommand(command: IFabricCommandBase): vscode.Disposable {
        const disposable = vscode.commands.registerCommand(
            command.commandName,
            (...args: any[]) => command.execute(...args)
        );

        this.commands.set(command.commandName, command);
        this.disposables.push(disposable);
        this.extensionContext.subscriptions.push(disposable);

        this.logger.log(`Registered command: ${command.commandName}`);
        return disposable;
    }

    /**
     * Initialize command manager (optional - for subclasses to override)
     */
    public async initialize(): Promise<void> {
        this.logger.log('FabricCommandManager initializing...');
        this.logger.log(`FabricCommandManager initialized with ${this.commands.size} commands`);
    }

    /**
     * Dispose all registered commands
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.commands.clear();

        this.logger.log('FabricCommandManager disposed');
    }
}
