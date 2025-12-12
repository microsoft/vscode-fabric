// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse, IArtifact, IArtifactManager, ICreateArtifactWorkflow, IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionManagerInternal, IArtifactManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { CreationCapability, ICreateItemsProvider, ItemCreationDetails } from '../metadata/definitions';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { succeeded, handleArtifactCreationErrorAndThrow } from '../utilities';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { ICapacityManager } from '../CapacityManager';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

export class CreateItemTypeQuickPickItem implements vscode.QuickPickItem {
    constructor(public details: ItemCreationDetails) {
        this.label = details.displayName;
        this.detail = details.description;
        if (details.creationCapability === CreationCapability.preview) {
            this.description = vscode.l10n.t('(Preview)');
        }
        this.iconPath = details.iconPath;
    }

    label: string;
    description?: string;
    detail?: string;
    iconPath?: vscode.IconPath | undefined;
}

/**
 * Prompts the user to select an artifact type and enter a name.
 * @returns An object with the selected artifact type details and the entered name, or undefined if cancelled.
 */
export async function promptForArtifactTypeAndName(
    context: vscode.ExtensionContext,
    itemsProvider: ICreateItemsProvider,
    workspaceManager: IWorkspaceManager,
    capacityManager: ICapacityManager,
    workspaceFilterManager: IWorkspaceFilterManager,
    telemetryService: TelemetryService | null,
    logger: ILogger,
    preselectedWorkspaceId?: string  // Add optional workspaceId parameter
): Promise<{ type: string, name: string, workspaceId: string } | undefined> {
    const quickPickTypeItems: CreateItemTypeQuickPickItem[] = [];
    const creatableItems: ItemCreationDetails[] = itemsProvider.getItemsForCreate(context.extensionUri);

    let selectedWorkspace: IWorkspace;

    if (preselectedWorkspaceId) {
        // Workspace is preselected from context menu, find it in the cache
        const workspace = await workspaceManager.getWorkspaceById(preselectedWorkspaceId);
        if (!workspace) {
            // Fallback to workspace selection if not found
            const workspaceFromPicker = await showWorkspaceQuickPick(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
            if (!workspaceFromPicker) {
                return undefined;
            }
            selectedWorkspace = workspaceFromPicker;
        }
        else {
            selectedWorkspace = workspace;
        }
    }
    else {
        // Show workspace picker as before
        const workspaceFromPicker = await showWorkspaceQuickPick(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
        if (!workspaceFromPicker) {
            return undefined;
        }
        selectedWorkspace = workspaceFromPicker;
    }

    creatableItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
    creatableItems.forEach(details => quickPickTypeItems.push(new CreateItemTypeQuickPickItem(details)));

    let selectedArtifactType: CreateItemTypeQuickPickItem | undefined;

    if (quickPickTypeItems.length === 1) {
        // If only one type is available, skip the picker and use it directly
        selectedArtifactType = quickPickTypeItems[0];
    }
    else {
        // Show the artifact type picker
        selectedArtifactType = await vscode.window.showQuickPick(
            quickPickTypeItems,
            { title: vscode.l10n.t('Choose Item type...'), canPickMany: false }
        );
    }

    if (!selectedArtifactType) {
        return undefined;
    }

    const artifactName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter name'),
        value: '',
        title: vscode.l10n.t('New {0}', selectedArtifactType.label),
    });

    if (!artifactName || !artifactName.trim()) {
        return undefined;
    }

    return {
        type: selectedArtifactType.details.type,
        name: artifactName.trim(),
        workspaceId: selectedWorkspace.objectId,
    };
}

export async function createArtifactCommand(
    artifactManager: IArtifactManager,
    extensionManager: IFabricExtensionManagerInternal,
    artifact: IArtifact,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<IArtifact | undefined> {
    let itemSpecificMetadata: any | undefined = undefined;

    // Check if there is a wizard enhancement for this item type
    // Get the matching view from the extension manager
    const createWorkflow: ICreateArtifactWorkflow | undefined = extensionManager.getArtifactHandler(artifact.type)?.createWorkflow;
    if (createWorkflow) {
        itemSpecificMetadata = await createWorkflow.showCreate(artifact);
        if (!itemSpecificMetadata) {
            // If the view returns undefined, do not create the artifact
            throw new UserCancelledError('createWorkflow');
        }
    }
    const response: IApiClientResponse = await artifactManager.createArtifact(artifact, itemSpecificMetadata);
    telemetryActivity.addOrUpdateProperties({
        'statusCode': response.status.toString(),
    });

    if (succeeded(response)) {
        if (response.parsedBody?.id) {
            artifact.id = response.parsedBody.id;
            telemetryActivity.addOrUpdateProperties({
                'artifactId': artifact.id,
            });
        }
        dataProvider.refresh();
        return artifact;
    }
    else {
        await handleArtifactCreationErrorAndThrow(response, artifact.displayName, artifact.type, telemetryActivity);
    }
}

export async function createArtifactCommandDeprecated(
    artifactManager: IArtifactManagerInternal,
    artifact: IArtifact
) {
    const response = await artifactManager.createArtifactDeprecated(artifact);
    if (succeeded(response)) {
        artifact.id = response.parsedBody.id;
        return artifact;
    }
}
