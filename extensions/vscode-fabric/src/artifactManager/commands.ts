import * as vscode from 'vscode';

import { commandNames } from '../constants';
import { CreateItemsProvider } from '../metadata/CreateItemsProvider';
import { getArtifactTypeFolder } from '../metadata/fabricItemUtilities';
import { fabricItemMetadata } from '../metadata/fabricItemMetadata';
import { IArtifact,  IWorkspace, IWorkspaceManager, ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
import { OperationRequestType } from '@microsoft/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, withErrorHandling, doFabricAction, ILogger } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { fabricViewWorkspace } from '../constants';
import { createArtifactCommand, createArtifactCommandDeprecated, promptForArtifactTypeAndName } from './createArtifactCommand';
import { readArtifactCommand } from './readArtifactCommand';
import { renameArtifactCommand } from './renameArtifactCommand';
import { deleteArtifactCommand } from './deleteArtifactCommand';
import { exportArtifactCommand } from './exportArtifactCommand';
import { ItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';
import { showSignInPrompt } from '../ui/prompts';
import { ICapacityManager } from '../CapacityManager';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { WorkspaceTreeNode } from '../workspace/treeNodes/WorkspaceTreeNode';

let artifactCommandDisposables: vscode.Disposable[] = [];

function registerCommand<T>(
    commandName: string,
    callback: (...args: any[]) => Promise<T>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    artifactCommandDisposables.push(disposable);
}

export async function registerArtifactCommands(context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    artifactManager: IArtifactManagerInternal,
    dataProvider: FabricWorkspaceDataProvider,
    extensionManager: IFabricExtensionManagerInternal,
    capacityManager: ICapacityManager,
    telemetryService: TelemetryService | null,
    logger: ILogger,
): Promise<void> {

    // Dispose of any existing commands
    artifactCommandDisposables.forEach(disposable => disposable.dispose());
    artifactCommandDisposables = [];

    registerCommand(
        commandNames.createArtifact,
        async (...cmdArgs) => {
            if (!(await workspaceManager.isConnected())) {
                void showSignInPrompt();
                return;
            }

            // Check if called from workspace context menu
            const workspaceTreeNode = cmdArgs[0] as WorkspaceTreeNode | undefined;
            const preselectedWorkspaceId = workspaceTreeNode?.workspace.objectId;

            const promptResult: { type: string, name: string, workspaceId: string } | undefined = await promptForArtifactTypeAndName(
                context, 
                new CreateItemsProvider(fabricItemMetadata), 
                workspaceManager, 
                capacityManager, 
                telemetryService, 
                logger,
                preselectedWorkspaceId
            );
            if (!promptResult) {
                return;
            }

            const artifact: IArtifact = {
                id: '',
                type: promptResult.type,
                displayName: promptResult.name,
                description: '',
                workspaceId: promptResult.workspaceId,
                fabricEnvironment: fabricEnvironmentProvider.getCurrent().env
            };

            if (artifactManager.shouldUseDeprecatedCommand(artifact.type, OperationRequestType.create)) {
                return await artifactManager.doContextMenuItem(cmdArgs, 'Create', async (item) => {
                    return await createArtifactCommandDeprecated(artifactManager, artifact);
                });
            }
            else {
                return await doArtifactAction(
                    artifact,
                    'createArtifact',
                    'item/create',
                    logger,
                    telemetryService,
                    async (activity, item) => {
                        addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                        return await createArtifactCommand(
                            artifactManager,
                            extensionManager,
                            item,
                            dataProvider,
                            activity
                        );
                    }
                );
            }
        },
        context);

    registerCommand(
        commandNames.readArtifact,
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode | undefined;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'readArtifact',
                'item/read',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await readArtifactCommand(item, artifactManager, activity);
                }
            );
        },
        context);

    registerCommand(
        commandNames.renameArtifact,
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode | undefined;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'renameArtifact',
                'item/update',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await renameArtifactCommand(item, artifactManager, dataProvider, activity);
                }
            );
        },
        context);

    registerCommand(
        commandNames.deleteArtifact,
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode | undefined;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'deleteArtifact',
                'item/delete',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await deleteArtifactCommand(item, artifactManager, workspaceManager, vscode.workspace.fs, telemetryService, logger, dataProvider, activity);
                }
            );
        },
        context);

    registerCommand(
        commandNames.exportArtifact, 
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode | undefined;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'exportArtifact', 
                'item/export',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await exportArtifactCommand(
                        item,
                        workspaceManager,
                        artifactManager, 
                        new ItemDefinitionWriter(vscode.workspace.fs),
                        activity,
                    );
                }
            );
        },
        context);

    registerCommand(
        commandNames.openArtifact, 
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'openArtifact',
                'item/open',
                logger,
                telemetryService,
                async (activity, item) => {
                    if (!item) {
                        return;
                    }

                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    if (cmdArgs.length >= 2 && cmdArgs[1] === 'Selected') { // not a context menu invocation
                        await artifactManager.selectArtifact(item);
                    }
                    else {
                        await artifactManager.openArtifact(item);
                    }
                }
            );
        },
        context
    );

    registerCommand(commandNames.refreshArtifactView, async (...cmdArgs) => {
        dataProvider.refresh();
        logger.log(vscode.l10n.t('RefreshArtifactView called {0}', Date()));
    }, context);

    registerCommand(commandNames.openInPortal, async (...cmdArgs) => {
        await withErrorHandling('openInPortal', logger, telemetryService, async () => {
            let portalUrl: string | undefined;
            let selectedWorkspace: IWorkspace | undefined;
            let artifact: IArtifact | undefined;

            // Check if the first argument is a WorkspaceTreeNode
            const firstArg = cmdArgs[0];
            if (firstArg instanceof WorkspaceTreeNode) {
                // Called from a workspace context menu
                selectedWorkspace = firstArg.workspace;
                portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, selectedWorkspace.objectId);
            }
            else {
                // Use the existing logic for artifact nodes or command palette
                let isHandled = false;
                await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Open In Portal'), async (item) => {
                    if (cmdArgs?.length > 1) { // if from tview context menu 
                        if (item) {
                            // Safe to assume that if there is an ArtifactTreeNode then there is a current workspace
                            artifact = item.artifact;
                            selectedWorkspace = workspaceManager.getWorkspaceById(artifact.workspaceId);
                            portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, artifact.workspaceId, artifact);
                            isHandled = true;
                        }
                    }
                    else {
                        selectedWorkspace = await showWorkspaceQuickPick(workspaceManager, capacityManager, telemetryService, logger);
                        if (!selectedWorkspace) {
                            return;
                        }
                        portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, selectedWorkspace.objectId);
                        isHandled = true;
                    }
                });
                
                // If doContextMenuItem didn't handle the operation, return early
                if (!isHandled || !portalUrl) {
                    return;
                }
            }
            
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/open/portal', telemetryService);
            void activity.doTelemetryActivity(async () => {
                activity.addOrUpdateProperties({
                    'workspaceId': selectedWorkspace?.objectId,
                    'fabricWorkspaceName': selectedWorkspace?.displayName,
                });
                if (artifact) {
                    activity.addOrUpdateProperties({
                        'artifactId': artifact.id,
                        'itemType': artifact.type,
                        'fabricArtifactName': artifact.displayName,
                    });
                }
                
                void vscode.env.openExternal(vscode.Uri.parse(portalUrl!));
            });
        })();
    }, context);    
}

export function formatPortalUrl(portalUri: string, workspaceId: string, artifact?: IArtifact): string {
    
    if (artifact && artifact.type && artifact.id) {
        return `https://${portalUri}/groups/${workspaceId}/${getArtifactTypeFolder(artifact)}/${artifact.id}?experience=data-engineering`;
    }
    else {
        return `https://${portalUri}/groups/${workspaceId}?experience=data-engineering`;
    }
}

async function doArtifactAction<T>(
    item: IArtifact | undefined,
    description: string,
    eventName: keyof CoreTelemetryEventNames,
    logger: ILogger,
    telemetryService: TelemetryService | null,
    callback: (activity: TelemetryActivity<CoreTelemetryEventNames>, item: IArtifact) => Promise<T>
): Promise<T | undefined> {
    return withErrorHandling(description, logger, telemetryService, async () => {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>(eventName, telemetryService);
        return await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            return await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                if (item) {
                    try {
                        const cbResult: T = await callback(activity, item);
                        activity.addOrUpdateProperties({ result: 'Succeeded' });
                        return cbResult;
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

function addCommonArtifactTelemetryProps(
    activity: any,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    item: IArtifact
): void {
    activity.addOrUpdateProperties({
        endpoint: fabricEnvironmentProvider.getCurrent().sharedUri,
        workspaceId: item.workspaceId,
        artifactId: item.id,
        fabricArtifactName: item.displayName,        
        itemType: item.type
    });
}