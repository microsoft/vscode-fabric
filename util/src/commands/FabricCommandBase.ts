// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryActivity, doFabricAction, withErrorHandling } from '../index';
import { IFabricCommandManagerBase, IFabricCommandBase } from './IFabricCommandManagerBase';

/**
 * Abstract base class for all Fabric commands that provides common error handling,
 * telemetry tracking, and dependency access functionality.
 * 
 * This base class works with any telemetry event type and command manager that extends
 * IFabricCommandManagerBase.
 * 
 * @template TEventNames - Type defining the telemetry events schema
 * @template TEventName - Specific event name from TEventNames
 * @template TCommandManager - Command manager type extending IFabricCommandManagerBase
 */
export abstract class FabricCommandBase<
    TEventNames extends Record<string, any>,
    TEventName extends string & keyof TEventNames = string & keyof TEventNames,
    TCommandManager extends IFabricCommandManagerBase = IFabricCommandManagerBase
> implements IFabricCommandBase<string> {

    public abstract readonly commandName: string;
    public abstract readonly telemetryEventName: TEventName;

    constructor(protected readonly commandManager: TCommandManager) {}

    /**
     * Public execute method that wraps the command execution with error handling and telemetry
     */
    public async execute(...args: any[]): Promise<any> {
        return withErrorHandling(
            this.commandName,
            this.commandManager.logger,
            this.commandManager.telemetryService,
            async () => {
                const activity = new TelemetryActivity<TEventNames>(
                    this.telemetryEventName,
                    this.commandManager.telemetryService
                );

                return await vscode.window.withProgress(
                    { location: this.getProgressLocation() },
                    async () => {
                        return await doFabricAction(
                            {
                                fabricLogger: this.commandManager.logger,
                                telemetryActivity: activity as any,
                            },
                            async () => {
                                try {
                                    const result = await this.executeInternal(activity, ...args);
                                    activity.addOrUpdateProperties({ result: 'Succeeded' } as any);
                                    return result;
                                }
                                catch (err: any) {
                                    if (err && err.isCanceledError === true) {
                                        activity.addOrUpdateProperties({ result: 'Canceled' } as any);
                                        const canceledError = err as any;
                                        if (canceledError.stepName) {
                                            activity.addOrUpdateProperties({ lastStep: canceledError.stepName } as any);
                                        }
                                        return;
                                    }
                                    activity.addOrUpdateProperties({ result: 'Failed' } as any);
                                    throw err;
                                }
                            }
                        );
                    }
                );
            }
        )();
    }

    /**
     * Internal execution method that subclasses must implement
     * This method contains the actual command logic and has access to the telemetry activity
     */
    protected abstract executeInternal(
        telemetryActivity: TelemetryActivity<TEventNames>,
        ...args: any[]
    ): Promise<any>;

    /**
     * Override this method to specify a custom progress location for the command
     * Default shows progress as a notification
     */
    protected getProgressLocation(): vscode.ProgressLocation | { viewId: string } {
        return vscode.ProgressLocation.Notification;
    }
}
