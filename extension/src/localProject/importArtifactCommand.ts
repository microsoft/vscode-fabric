// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IWorkspaceManager, IArtifactManager, IWorkspace, IApiClientResponse, IItemDefinition, IUpdateArtifactDefinitionWorkflow, ICreateArtifactWithDefinitionWorkflow } from '@microsoft/vscode-fabric-api';
import { ILocalFolderService } from '../LocalFolderService';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, UserCancelledError, ILogger } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionReader } from '../itemDefinition/ItemDefinitionReader';
import { tryParseLocalProjectData } from '@microsoft/vscode-fabric-util';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { showSignInPrompt } from '../ui/prompts';
import { ICapacityManager } from '../CapacityManager';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

export async function importArtifactCommand(
    folder: vscode.Uri,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    extensionManager: IFabricExtensionManagerInternal,
    localFolderService: ILocalFolderService,
    workspaceFilterManager: IWorkspaceFilterManager,
    capacityManager: ICapacityManager,
    reader: IItemDefinitionReader,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
    telemetryService: TelemetryService | null,
    logger: ILogger,
    forcePromptForWorkspace: boolean
): Promise<void> {
    if (!(await workspaceManager.isConnected())) {
        void showSignInPrompt();
        throw new UserCancelledError('signIn');
    }

    const projectData = await tryParseLocalProjectData(folder);
    if (!projectData) {
        throw new FabricError(
            vscode.l10n.t('No valid Fabric project data found in {0}', folder.fsPath),
            'Import artifact failed: No valid project data',
            { showInUserNotification: 'Information' });
    }
    const displayName: string = projectData.displayName;
    const targetType: string = projectData.type;
    telemetryActivity.addOrUpdateProperties({
        fabricArtifactName: displayName,
        itemType: targetType,
    });

    // Get the artifact handler and workflows for this type
    const handler = extensionManager.getArtifactHandler(targetType);
    const createWorkflow = handler?.createWithDefinitionWorkflow;
    const updateWorkflow = handler?.updateDefinitionWorkflow;

    // Try to infer workspace and artifact from folder using localFolderService
    let targetWorkspace: IWorkspace | undefined;
    let artifact: IArtifact | undefined;

    if (!forcePromptForWorkspace) {
        const artifactInfo = localFolderService.getArtifactInformation(folder);
        if (artifactInfo?.workspaceId) {
            targetWorkspace = await workspaceManager.getWorkspaceById(artifactInfo.workspaceId);
            telemetryActivity.addOrUpdateProperties({
                targetDetermination: 'inferred',
            });

            // Try to get the artifact by ID if we have it
            if (targetWorkspace && artifactInfo.artifactId) {
                const allArtifacts = await artifactManager.listArtifacts(targetWorkspace);
                artifact = allArtifacts.find(item => item.id === artifactInfo.artifactId);
            }
        }
    }

    // If not found, fall back to user selection
    if (!targetWorkspace) {
        targetWorkspace = await showWorkspaceQuickPick(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
        if (!targetWorkspace) {
            throw new UserCancelledError('selectWorkspace');
        }

        telemetryActivity.addOrUpdateProperties({
            targetDetermination: forcePromptForWorkspace ? 'forced' : 'prompt',
        });
    }

    telemetryActivity.addOrUpdateProperties({
        workspaceId: targetWorkspace.objectId,
        fabricWorkspaceName: targetWorkspace.displayName,
    });

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Publishing {0}...', displayName),
            cancellable: false,
        },
        async (progress) => {
            // Fallback: search by name and type if artifact ID lookup failed or wasn't available
            if (!artifact) {
                const allArtifacts = await artifactManager.listArtifacts(targetWorkspace);
                artifact = allArtifacts.find(item => item.type === targetType && item.displayName === displayName);
            }

            let definition: IItemDefinition;
            let definitionFiles: string[] | undefined = undefined;
            let response: IApiClientResponse;
            if (!artifact) {
                const newArtifact: IArtifact = {
                    id: '',
                    type: targetType,
                    displayName: displayName,
                    description: '',
                    workspaceId: targetWorkspace.objectId,
                    fabricEnvironment: fabricEnvironmentProvider.getCurrent().env,
                };

                if (createWorkflow?.prepareForCreateWithDefinition) {
                    definitionFiles = await createWorkflow.prepareForCreateWithDefinition(newArtifact, folder);
                    if (!definitionFiles) {
                        throw new UserCancelledError('prepareForCreateWithDefinition');
                    }
                }
                definition = await readDefinition(reader, folder, targetType, definitionFiles);

                response = await artifactManager.createArtifactWithDefinition(
                    newArtifact,
                    definition,
                    folder,
                    {
                        progress: progress,
                    }
                );
                if (succeeded(response)) {
                    artifact = response.parsedBody;
                    await dataProvider.refresh();
                }
            }
            else {
                telemetryActivity.addOrUpdateProperties({
                    artifactId: artifact.id,
                });

                // Make sure the user wants to overwrite the existing item
                const confirm = await vscode.window.showInformationMessage(
                    vscode.l10n.t('An item named "{0}" already exists in workspace "{1}". Do you want to overwrite it?', displayName, targetWorkspace.displayName),
                    { modal: true },
                    vscode.l10n.t('Yes')
                );
                if (confirm !== vscode.l10n.t('Yes')) {
                    throw new UserCancelledError('overwriteConfirmation');
                }

                if (updateWorkflow?.prepareForUpdateWithDefinition) {
                    definitionFiles = await updateWorkflow.prepareForUpdateWithDefinition(artifact, folder);
                    if (!definitionFiles) {
                        throw new UserCancelledError('prepareForUpdateWithDefinition');
                    }
                }
                definition = await readDefinition(reader, folder, targetType, definitionFiles);

                response = await artifactManager.updateArtifactDefinition(
                    artifact,
                    definition,
                    folder,
                    {
                        progress: progress,
                    }
                );
            }
            telemetryActivity.addOrUpdateProperties({
                'statusCode': response?.status.toString(),
            });

            if (succeeded(response)) {
                const openAction = vscode.l10n.t('Open in Fabric');
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('Published {0}', displayName),
                    openAction
                ).then(action => {
                    if (action === openAction) {
                        void vscode.commands.executeCommand('vscode-fabric.openInPortal', artifact);
                    }
                });
            }
            else {
                telemetryActivity.addOrUpdateProperties({
                    'requestId': response.parsedBody?.requestId,
                    'errorCode': response.parsedBody?.errorCode,
                });
                throw new FabricError(
                    formatErrorResponse(vscode.l10n.t('Error publishing {0}', displayName), response),
                    response.parsedBody?.errorCode || `Publishing Artifact failed ${targetType} ${response.status}`,
                    { showInUserNotification: 'Information' }
                );
            }
        }
    );
}

async function readDefinition(
    reader: IItemDefinitionReader,
    folder: vscode.Uri,
    targetType: string,
    files?: string[]
): Promise<IItemDefinition> {
    try {
        return await reader.read(folder, files);
    }
    catch (error: any) {
        throw new FabricError(
            vscode.l10n.t('Error reading item definition from {0}: {1}', folder.fsPath, error.message ?? 'Unknown error'),
            `Reading Item Definition failed for type ${targetType}`,
            { showInUserNotification: 'Information' }
        );
    }
}
