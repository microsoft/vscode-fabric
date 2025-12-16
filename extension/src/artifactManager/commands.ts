// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { commandNames } from '../constants';
import { CreateItemsProvider } from '../metadata/CreateItemsProvider';
import { getArtifactTypeFolder } from '../metadata/fabricItemUtilities';
import { fabricItemMetadata } from '../metadata/fabricItemMetadata';
import { IArtifact,  IWorkspace, IWorkspaceManager, ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
import { OperationRequestType } from '@microsoft/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, withErrorHandling, doFabricAction, ILogger, IConfigurationProvider, FABRIC_ENVIRONMENT_PROD } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { fabricViewWorkspace } from '../constants';
import { createArtifactCommand, createArtifactCommandDeprecated, promptForArtifactTypeAndName } from './createArtifactCommand';
import { readArtifactCommand } from './readArtifactCommand';
import { renameArtifactCommand } from './renameArtifactCommand';
import { deleteArtifactCommand } from './deleteArtifactCommand';
import { exportArtifactCommand } from './exportArtifactCommand';
import { openLocalFolderCommand } from './openLocalFolderCommand';
import { changeLocalFolderCommand } from './changeLocalFolderCommand';
import { ItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { FabricError, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { showSignInPrompt } from '../ui/prompts';
import { ICapacityManager } from '../CapacityManager';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { WorkspaceTreeNode } from '../workspace/treeNodes/WorkspaceTreeNode';
import { ArtifactTypeTreeNode } from '../workspace/treeNodes/ArtifactTypeTreeNode';
import { ItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';
import { ILocalFolderService } from '../LocalFolderService';
import { IAccountProvider } from '../authentication';
import { NotSignedInError } from '../ui/NotSignedInError';


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
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    dataProvider: FabricWorkspaceDataProvider,
    extensionManager: IFabricExtensionManagerInternal,
    workspaceFilterManager: IWorkspaceFilterManager,
    capacityManager: ICapacityManager,
    accountProvider: IAccountProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger
): Promise<void> {

    // Dispose of any existing commands
    artifactCommandDisposables.forEach(disposable => disposable.dispose());
    artifactCommandDisposables = [];

    registerCommand(
        commandNames.changeLocalFolder,
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'changeLocalFolder',
                'item/localFolder/change',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await changeLocalFolderCommand(
                        item,
                        artifactManager,
                        localFolderService,
                        configurationProvider,
                        new ItemDefinitionConflictDetector(vscode.workspace.fs),
                        new ItemDefinitionWriter(vscode.workspace.fs),
                        activity,
                        { skipWarning: false, promptForSave: false }
                    );
                }
            );
        },
        context
    );

    registerCommand(
        commandNames.createArtifact,
        async (...cmdArgs) => {
            if (!(await workspaceManager.isConnected())) {
                void showSignInPrompt();
                return;
            }

            // Check if called from workspace or artifact type context menu
            let preselectedWorkspaceId: string | undefined;
            let preselectedArtifactType: string | undefined;

            const contextNode = cmdArgs[0];
            if (contextNode instanceof WorkspaceTreeNode) {
                preselectedWorkspaceId = contextNode.workspace.objectId;
            }
            else if (contextNode instanceof ArtifactTypeTreeNode) {
                preselectedWorkspaceId = contextNode.workspaceId;
                preselectedArtifactType = contextNode.artifactType;
            }

            const promptResult: { type: string, name: string, workspaceId: string } | undefined = await promptForArtifactTypeAndName(
                context,
                new CreateItemsProvider(fabricItemMetadata, preselectedArtifactType),
                workspaceManager,
                capacityManager,
                workspaceFilterManager,
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
                fabricEnvironment: fabricEnvironmentProvider.getCurrent().env,
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
        context
    );

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
        context
    );

    registerCommand(
        commandNames.exportArtifact,
        async (...cmdArgs) => {
            const arg = cmdArgs[0];
            let artifact: IArtifact | undefined;
            let options: undefined | { modal: boolean; includeDoNothing: boolean };

            // If called with an ArtifactTreeNode, use its artifact
            if (arg && typeof arg === 'object' && 'artifact' in arg) {
                artifact = arg.artifact;
            }
            else if (arg && typeof arg === 'object' && 'artifactId' in arg && 'workspaceId' in arg) {
                validateIdentifiers(arg.artifactId, arg.workspaceId);

                const isSignedIn: boolean = await ensureSignedIn(accountProvider);
                if (!isSignedIn) {
                    throw new NotSignedInError();
                }

                // If called with an object from UriHandler, resolve environment and artifact
                if (arg.environment) {
                    if (!(await fabricEnvironmentProvider.switchToEnvironment(arg.environment))) {
                        throw new FabricError(vscode.l10n.t('Environment parameter not valid: {0}', arg.environment), 'Environment parameter not valid');
                    }
                }
                else {
                    await fabricEnvironmentProvider.switchToEnvironment(FABRIC_ENVIRONMENT_PROD);
                }
                const artifacts = await workspaceManager.getItemsInWorkspace(arg.workspaceId);
                artifact = artifacts.find(a => a.id === arg.artifactId);
                options = { modal: true, includeDoNothing: false };
            }

            if (!artifact) {
                throw new FabricError(vscode.l10n.t('Could not resolve item for Download Item Definition command.'), 'Item not found');
            }
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/export', telemetryService);

            // The error handling is deferred until the action is executed because the UriHandler may also be providing error handling
            await withErrorHandling('exportArtifact', logger, telemetryService, async () => {
                // Don't use doArtifactAction because exportArtifactCommand should be handling the progress
                await doFabricAction({ fabricLogger: logger, telemetryActivity: activity }, async () => {
                    try {
                        addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, artifact);
                        await exportArtifactCommand(
                            artifact,
                            artifactManager,
                            localFolderService,
                            configurationProvider,
                            new ItemDefinitionConflictDetector(vscode.workspace.fs),
                            new ItemDefinitionWriter(vscode.workspace.fs),
                            activity,
                            options
                        );
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
                });
            })();
        },
        context
    );

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

    registerCommand(
        commandNames.openInPortal,
        async (...cmdArgs) => {
            await withErrorHandling('openInPortal', logger, telemetryService, async () => {
                let portalUrl: string | undefined;
                let selectedWorkspace: IWorkspace | undefined;
                let artifact: IArtifact | undefined;

                const arg = cmdArgs[0];
                if (arg instanceof WorkspaceTreeNode) {
                    // Called from a workspace context menu
                    selectedWorkspace = arg.workspace;
                    portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, selectedWorkspace.objectId);
                }
                else if (arg instanceof ArtifactTreeNode) {
                    // Called from an artifact tree node context menu
                    artifact = arg.artifact;
                    portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, artifact.workspaceId, artifact);
                }
                else if (arg && typeof arg === 'object' && 'id' in arg && 'workspaceId' in arg && 'type' in arg) {
                    // Called with an IArtifact directly
                    artifact = arg as IArtifact;
                    portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, artifact.workspaceId, artifact);
                }
                else {
                    // Called from command palette - show workspace picker
                    selectedWorkspace = await showWorkspaceQuickPick(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
                    if (!selectedWorkspace) {
                        return;
                    }
                    portalUrl = formatPortalUrl(fabricEnvironmentProvider.getCurrent().portalUri, selectedWorkspace.objectId);
                }

                const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/open/portal', telemetryService);
                void activity.doTelemetryActivity(async () => {
                    if (selectedWorkspace) {
                        activity.addOrUpdateProperties({
                            'workspaceId': selectedWorkspace?.objectId,
                            'fabricWorkspaceName': selectedWorkspace?.displayName,
                        });
                    }
                    if (artifact) {
                        activity.addOrUpdateProperties({
                            'workspaceId': artifact?.workspaceId,
                            'artifactId': artifact.id,
                            'itemType': artifact.type,
                            'fabricArtifactName': artifact.displayName,
                        });
                    }

                    void vscode.env.openExternal(vscode.Uri.parse(portalUrl!));
                });
            })();
        },
        context
    );

    registerCommand(
        commandNames.openLocalFolder,
        async (...cmdArgs) => {
            const artifactTreeNode = cmdArgs[0] as ArtifactTreeNode;
            await doArtifactAction(
                artifactTreeNode?.artifact,
                'openLocalFolder',
                'item/localFolder/open',
                logger,
                telemetryService,
                async (activity, item) => {
                    addCommonArtifactTelemetryProps(activity, fabricEnvironmentProvider, item);
                    await openLocalFolderCommand(
                        item,
                        artifactManager,
                        localFolderService,
                        configurationProvider,
                        new ItemDefinitionConflictDetector(vscode.workspace.fs),
                        new ItemDefinitionWriter(vscode.workspace.fs),
                        activity
                    );
                }
            );
        },
        context
    );

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
        context
    );

    registerCommand(
        commandNames.refreshArtifactView,
        async (...cmdArgs) => {
            dataProvider.refresh();
            logger.log(vscode.l10n.t('RefreshArtifactView called {0}', Date()));
        },
        context
    );

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
        context
    );
}

function formatPortalUrl(portalUri: string, workspaceId: string, artifact?: IArtifact): string {

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
        itemType: item.type,
    });
}

async function ensureSignedIn(accountProvider: IAccountProvider): Promise<boolean> {
    if (!(await accountProvider.isSignedIn())) {
        await accountProvider.awaitSignIn();
    }

    return accountProvider.isSignedIn();
}

function validateIdentifiers(artifactId: string, workspaceId: string): void {
    if (!isValidGuid(artifactId)) {
        throw new FabricError(vscode.l10n.t('Invalid item identifier: \'{0}\'', artifactId), 'Invalid item identifier');
    }
    if (!isValidGuid(workspaceId)) {
        throw new FabricError(vscode.l10n.t('Invalid workspace identifier: \'{0}\'', workspaceId), 'Invalid workspace identifier');
    }
}

function isValidGuid(guid: string): boolean { // returns false for empty string
    const guidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    return guidRegex.test(guid);
}
