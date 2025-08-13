import * as vscode from 'vscode';
import { IArtifact, IWorkspaceManager, IArtifactManager, IWorkspace, IApiClientResponse, IItemDefinition } from '@fabric/vscode-fabric-api';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity, TelemetryService, IFabricEnvironmentProvider, UserCancelledError, ILogger } from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionReader } from '../itemDefinition/ItemDefinitionReader';
import { tryParseLocalProjectData } from './utilities';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { showSignInPrompt } from '../ui/prompts';
import { ICapacityManager } from '../CapacityManager';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';

export async function importArtifactCommand(
    folder: vscode.Uri,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    capacityManager: ICapacityManager,
    reader: IItemDefinitionReader,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
    telemetryService: TelemetryService | null,
    logger: ILogger,
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
        itemType: targetType
    });

    const targetWorkspace: IWorkspace | undefined = await showWorkspaceQuickPick(workspaceManager, capacityManager, telemetryService, logger);
    if (!targetWorkspace) {
        throw new UserCancelledError('selectWorkspace');
    };

    telemetryActivity.addOrUpdateProperties({
        workspaceId: targetWorkspace.objectId,
        fabricWorkspaceName: targetWorkspace.displayName,
    });

    let definition: IItemDefinition;
    try {
        definition = await reader.read(folder);
    }
    catch (error: any) {
        throw new FabricError(
            vscode.l10n.t('Error reading item definition from {0}: {1}', folder.fsPath, error.message ?? 'Unknown error'),
            `Reading Item Definition failed for type ${targetType}`,
            { showInUserNotification: 'Information' }
        );
    }

    const artifact: IArtifact | undefined = (await artifactManager.listArtifacts(targetWorkspace))
        .find(item => item.type === targetType && item.displayName === displayName);

    let response: IApiClientResponse;
    if (!artifact) {
        const newArtifact: IArtifact = {
            id: '',
            type: targetType,
            displayName: displayName,
            description: '',
            workspaceId: targetWorkspace.objectId,
            fabricEnvironment: fabricEnvironmentProvider.getCurrent().env
        };

        response = await artifactManager.createArtifactWithDefinition(newArtifact, definition);
        if (workspaceManager.currentWorkspace?.objectId === targetWorkspace.objectId) {
            // If the current workspace is the same as the target workspace, we need to refresh the data provider
            // to ensure the new artifact is shown in the UI.
            await dataProvider.refresh();
        }
    }
    else {
        telemetryActivity.addOrUpdateProperties({
            artifactId: artifact.id,
        });

        response = await artifactManager.updateArtifactDefinition(artifact, definition);
    }
    telemetryActivity.addOrUpdateProperties({
        'statusCode': response?.status.toString(),
    });
    
    if (succeeded(response)) {
        void vscode.window.showInformationMessage(vscode.l10n.t('Published {0}', displayName));
    }
    else {
        telemetryActivity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode
        });
        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error publishing {0}', displayName), response),
            response.parsedBody?.errorCode || `Publishing Artifact failed ${targetType} ${response.status}`,
            { showInUserNotification: 'Information' }
        );
    }        
}