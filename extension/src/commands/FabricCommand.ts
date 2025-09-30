import * as vscode from 'vscode';
import { TelemetryActivity, doFabricAction, withErrorHandling } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IFabricCommandManager, IFabricCommand } from './IFabricCommandManager';
import { fabricViewWorkspace } from '../constants';

/**
 * Abstract base class for all Fabric commands that provides common error handling,
 * telemetry tracking, and dependency access functionality
 */
export abstract class FabricCommand<TEventName extends keyof CoreTelemetryEventNames = keyof CoreTelemetryEventNames>
implements IFabricCommand<TEventName> {

    public abstract readonly commandName: string;
    public abstract readonly telemetryEventName: TEventName;

    constructor(protected readonly commandManager: IFabricCommandManager) {}

    /**
     * Public execute method that wraps the command execution with error handling and telemetry
     */
    public async execute(...args: any[]): Promise<any> {
        return withErrorHandling(
            this.commandName,
            this.commandManager.logger,
            this.commandManager.telemetryService,
            async () => {
                const activity = new TelemetryActivity<CoreTelemetryEventNames>(
                    this.telemetryEventName,
                    this.commandManager.telemetryService
                );

                return await vscode.window.withProgress(
                    { location: this.getProgressLocation() },
                    async () => {
                        return await doFabricAction(
                            {
                                fabricLogger: this.commandManager.logger,
                                telemetryActivity: activity,
                            },
                            async () => {
                                try {
                                    const result = await this.executeInternal(activity, ...args);
                                    activity.addOrUpdateProperties({ result: 'Succeeded' });
                                    return result;
                                }
                                catch (err: any) {
                                    if (err && err.isCanceledError === true) {
                                        activity.addOrUpdateProperties({ result: 'Canceled' });
                                        const canceledError = err as any;
                                        if (canceledError.stepName) {
                                            activity.addOrUpdateProperties({ lastStep: canceledError.stepName });
                                        }
                                        return;
                                    }
                                    activity.addOrUpdateProperties({ result: 'Failed' });
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
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<any>;

    /**
     * Override this method to specify a custom progress location for the command
     * Default shows progress in the Fabric workspace view
     */
    protected getProgressLocation(): vscode.ProgressLocation | { viewId: string } {
        return { viewId: fabricViewWorkspace };
    }

    /**
     * Optional validation method that can be overridden to check if command can execute
     */
    public canExecute(...args: any[]): boolean {
        return true;
    }

    /**
     * Helper method to add common telemetry properties for artifact operations
     */
    protected addArtifactTelemetryProperties(
        activity: TelemetryActivity<CoreTelemetryEventNames>,
        artifact: any
    ): void {
        activity.addOrUpdateProperties({
            endpoint: this.commandManager.fabricEnvironmentProvider.getCurrent().sharedUri,
            workspaceId: artifact.workspaceId,
            artifactId: artifact.id,
            fabricArtifactName: artifact.displayName,
            itemType: artifact.type,
        });
    }
}
