// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { commandNames } from '../constants';
import { IArtifact, IWorkspaceManager, ArtifactTreeNode } from '@microsoft/vscode-fabric-api';
import { IArtifactManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, withErrorHandling, doFabricAction, ILogger, IConfigurationProvider, FABRIC_ENVIRONMENT_PROD } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricError, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication';
import { NotSignedInError } from '../ui/NotSignedInError';

import { exportArtifactCommand } from './exportArtifactCommand';
import { openLocalFolderCommand } from './openLocalFolderCommand';
import { changeLocalFolderCommand } from './changeLocalFolderCommand';
import { ItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';
import { ItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { ILocalFolderService } from '../LocalFolderService';
import { doArtifactAction, addCommonArtifactTelemetryProps } from './commands';

let exportCommandDisposables: vscode.Disposable[] = [];

function registerCommand<T>(
    commandName: string,
    callback: (...args: any[]) => Promise<T>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    exportCommandDisposables.push(disposable);
}

export function registerArtifactExportCommands(
    context: vscode.ExtensionContext,
    workspaceManager: IWorkspaceManager,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    artifactManager: IArtifactManagerInternal,
    localFolderService: ILocalFolderService,
    configurationProvider: IConfigurationProvider,
    accountProvider: IAccountProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger
): void {

    // Dispose of any existing export commands
    exportCommandDisposables.forEach(disposable => disposable.dispose());
    exportCommandDisposables = [];

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

function isValidGuid(guid: string): boolean {
    const guidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    return guidRegex.test(guid);
}
