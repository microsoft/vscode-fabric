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

let artifactCommandDisposables: vscode.Disposable[] = [];

function registerCommand(
    commandName: string,
    callback: (...args: any[]) => Promise<void>,
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

            const promptResult: { type: string, name: string } | undefined = await promptForArtifactTypeAndName(context, new CreateItemsProvider(fabricItemMetadata));
            if (!promptResult) {
                return;
            }

            const artifact: IArtifact = {
                id: '',
                type: promptResult.type,
                displayName: promptResult.name,
                description: '',
                workspaceId: workspaceManager.currentWorkspace!.objectId,
                fabricEnvironment: fabricEnvironmentProvider.getCurrent().env
            };

            if (artifactManager.shouldUseDeprecatedCommand(artifact.type, OperationRequestType.create)) {
                await artifactManager.doContextMenuItem(cmdArgs, 'Create', async (item) => {
                    await createArtifactCommandDeprecated(artifactManager, artifact);
                });
            }
            else {
                await doArtifactAction(
                    artifact,
                    'createArtifact',
                    'item/create',
                    logger,
                    telemetryService,
                    async (activity, item) => {
                        addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, workspaceManager, item);
                        await createArtifactCommand(
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
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, workspaceManager, item);
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
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, workspaceManager, item);
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
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, workspaceManager, item);
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
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, workspaceManager, item);
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

    registerCommand(commandNames.openArtifact, async (...cmdArgs) => {
        await withErrorHandling('openArtifact', logger, telemetryService, async () => {
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/open', telemetryService);
            await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                const item = cmdArgs[0] as ArtifactTreeNode;
                if (!item) {
                    return;
                }
                if (cmdArgs.length >= 2 && cmdArgs[1] === 'Selected') { // not a context menu invocation
                    await artifactManager.selectArtifact(item.artifact);
                }
                else {
                    await artifactManager.openArtifact(item.artifact);
                }
            });
        })();
    }, context);

    registerCommand(commandNames.refreshArtifactView, async (...cmdArgs) => {
        dataProvider.refresh();
        logger.log(vscode.l10n.t('RefreshArtifactView called {0}', Date()));
    }, context);

    registerCommand(commandNames.openInPortal, async (...cmdArgs) => {
        await artifactManager.doContextMenuItem(cmdArgs, vscode.l10n.t('Open In Portal'), async (item) => {
            let portalUrl: string | undefined = undefined;

            if (cmdArgs?.length > 1) { // if from tview context menu 
                if (item) {
                    // Safe to assume that if there is an ArtifactTreeNode then there is a current workspace
                    portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, workspaceManager.currentWorkspace!, item.artifact);
                }
            }
            else if (workspaceManager.currentWorkspace) {
                portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, workspaceManager.currentWorkspace);
            }

            if (portalUrl) {
                const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/open/portal', telemetryService);
                void activity.doTelemetryActivity(async () => {
                    activity.addOrUpdateProperties({
                        'workspaceId': workspaceManager.currentWorkspace!.objectId,
                        'fabricWorkspaceName': workspaceManager.currentWorkspace!.displayName,
                    });
                    if (item) {
                        activity.addOrUpdateProperties({
                            'artifactId': item.artifact.id,
                            'itemType': item.artifact.type,
                            'fabricArtifactName': item.artifact.displayName,
                        });
                    }
                    
                    void vscode.env.openExternal(vscode.Uri.parse(portalUrl));
                });
            }
        });
    }, context);    
}

export function formatPortalUrl(portalUri: string, workspace: IWorkspace, artifact?: IArtifact): string | undefined {
    if (workspace && workspace.objectId) {
        if (artifact && artifact.type && artifact.id) {
            return `https://${portalUri}/groups/${workspace.objectId}/${getArtifactTypeFolder(artifact)}/${artifact.id}?experience=data-engineering`;
        }
        else {
            return `https://${portalUri}/groups/${workspace.objectId}?experience=data-engineering`;
        }
    }

    return undefined;
}

async function doArtifactAction(
    item: IArtifact | undefined,
    description: string,
    eventName: keyof CoreTelemetryEventNames,
    logger: ILogger,
    telemetryService: TelemetryService | null,
    callback: (activity: TelemetryActivity<CoreTelemetryEventNames>, item: IArtifact) => Promise<void>
): Promise<void> {
    return withErrorHandling(description, logger, telemetryService, async () => {
        const activity = new TelemetryActivity<CoreTelemetryEventNames>(eventName, telemetryService);
        await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                if (item) {
                    try {
                        await callback(activity, item);
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

function addCommonArtifactTelemetryProps(
    activity: any,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    workspaceManager: IWorkspaceManager,
    item: IArtifact
): void {
    activity.addOrUpdateProperties({
        endpoint: fabricEnvironmentProvider.getCurrent().sharedUri,
        workspaceId: item.workspaceId,
        artifactId: item.id,
        fabricArtifactName: item.displayName,
        fabricWorkspaceName: workspaceManager.currentWorkspace!.displayName,
        itemType: item.type
    });
}