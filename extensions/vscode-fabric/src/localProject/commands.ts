import * as vscode from 'vscode';

import { commandNames } from '../constants';
import { IWorkspaceManager, LocalProjectTreeNode, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, withErrorHandling, doFabricAction, ILogger } from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { fabricViewWorkspace } from '../constants';
import { importArtifactCommand } from './importArtifactCommand';
import { UserCancelledError } from '@fabric/vscode-fabric-util';
import { ItemDefinitionReader } from '../itemDefinition/ItemDefinitionReader';
import { ICapacityManager } from '../CapacityManager';

let commandDisposables: vscode.Disposable[] = [];

function registerCommand(
    commandName: string,
    callback: (...args: any[]) => Promise<void>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    commandDisposables.push(disposable);
}

export function registerLocalProjectCommands(context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager, 
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    artifactManager: IArtifactManagerInternal, 
    capacityManager: ICapacityManager,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger,
): void {

    // Dispose of any existing commands
    commandDisposables.forEach(disposable => disposable.dispose());
    commandDisposables = [];

    registerCommand(
        commandNames.importArtifact, 
        async (...cmdArgs) => {
            const localProjectTreeNode = cmdArgs[0] as LocalProjectTreeNode;
            if (localProjectTreeNode) {
                await doAction(
                    localProjectTreeNode.folder,
                    'importArtifact', 
                    'item/import',
                    logger,
                    telemetryService,
                    async (activity, folder) => {
                        activity.addOrUpdateProperties({
                            endpoint: fabricEnvironmentProvider.getCurrent().sharedUri,
                        });
                        await importArtifactCommand(
                            folder,
                            workspaceManager,
                            artifactManager,
                            capacityManager,
                            new ItemDefinitionReader(vscode.workspace.fs),
                            fabricEnvironmentProvider,
                            dataProvider,
                            activity,
                            telemetryService,
                            logger,
                        );
                    }
                );
            }
        },
        context);
}

async function doAction(
    folder: vscode.Uri,
    description: string,
    eventName: keyof CoreTelemetryEventNames,
    logger: ILogger,
    telemetryService: TelemetryService | null,
    callback: (activity: TelemetryActivity<CoreTelemetryEventNames>, folder: vscode.Uri) => Promise<void>
): Promise<void> {
    return withErrorHandling(description, logger, telemetryService, async () => {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>(eventName, telemetryService);
        await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                if (folder) {
                    try {
                        await callback(activity, folder);
                        activity.addOrUpdateProperties({ result: 'Succeeded' });
                    }
                    catch (err) {
                        if (err instanceof UserCancelledError) {
                            activity.addOrUpdateProperties({ result: 'Canceled' });
                            if (err.stepName) {
                                activity.addOrUpdateProperties({ lastStep: err.stepName });
                            }
                            return;
                        }
                        activity.addOrUpdateProperties({ result: 'Failed' });
                        throw err;
                    }
                }
            });
        });
    })();
}
