import * as vscode from 'vscode';
import { IApiClientResponse, IArtifact, IArtifactManager, ICreateArtifactWorkflow } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, TelemetryService, ILogger, FabricError } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionManagerInternal, IArtifactManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { CreationCapability, ICreateItemsProvider, ItemCreationDetails } from '../metadata/definitions';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { formatErrorResponse, succeeded, handleArtifactCreationErrorAndThrow } from '../utilities';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';

class CreateItemQuickPickItem implements vscode.QuickPickItem {
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
    itemsProvider: ICreateItemsProvider
): Promise<{ type: string, name: string } | undefined> {
    const quickPickItems: CreateItemQuickPickItem[] = [];
    const creatableItems: ItemCreationDetails[] = itemsProvider.getItemsForCreate(context.extensionUri);

    creatableItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
    creatableItems.forEach(details => quickPickItems.push(new CreateItemQuickPickItem(details)));

    const selectedArtifactType = await vscode.window.showQuickPick(
        quickPickItems,
        { title: vscode.l10n.t('Choose Item type...'), canPickMany: false }
    );

    if (!selectedArtifactType) {
        return undefined;
    }

    const artifactName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter name'),
        value: '',
        title: vscode.l10n.t('New {0}', selectedArtifactType.label)
    });

    if (!artifactName || !artifactName.trim()) {
        return undefined;
    }

    return {
        type: selectedArtifactType.details.type,
        name: artifactName.trim()
    };
}

export async function createArtifactCommand(
    artifactManager: IArtifactManager,
    extensionManager: IFabricExtensionManagerInternal,
    artifact: IArtifact,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
) {
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
                'artifactId': artifact.id
            });
        }
        dataProvider.refresh();
    }
    else {
        await handleArtifactCreationErrorAndThrow(response, artifact.displayName, artifact.type, telemetryActivity);
    }
}

export async function createArtifactCommandDeprecated(
    artifactManager: IArtifactManagerInternal,
    artifact: IArtifact
) {
    await artifactManager.createArtifactDeprecated(artifact);
}