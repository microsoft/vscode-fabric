import * as vscode from 'vscode';
import { IArtifact, IWorkspaceManager, IArtifactManager } from '@fabric/vscode-fabric-api';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity, UserCancelledError } from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';

export async function exportArtifactCommand(
    artifact: IArtifact,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
): Promise<void> {
    // Get the folder to export to
    const targetFolder = await workspaceManager.getLocalFolderForArtifact(artifact, { createIfNotExists: true });
    if (!targetFolder) {
        throw new UserCancelledError('localFolderSelection');
    }
    
    // Invoke API to export the artifact
    const response = await artifactManager.getArtifactDefinition(artifact);
    telemetryActivity.addOrUpdateProperties({
        'statusCode': response?.status.toString(),
    });

    // Copy the exported files to disk
    if (succeeded(response)) {
        try {
            await itemDefinitionWriter.save(response.parsedBody?.definition, targetFolder);
            void vscode.window.showInformationMessage(vscode.l10n.t('Opened {0}', artifact.displayName));
            await vscode.commands.executeCommand('vscode.openFolder', targetFolder); // default to open in current window
        }
        catch (error: any) {
            throw new FabricError(
                vscode.l10n.t('Error opening {0}: {1}', artifact.displayName, error.message ?? 'Unknown error'),
                `Opening Artifact failed during save ${artifact.type})`,
                { showInUserNotification: 'Information' }
            );
        }
    }
    else {
        telemetryActivity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode
        });

        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error opening {0}', artifact.displayName), response),
            response.parsedBody?.errorCode || `Opening Artifact failed ${artifact.type} ${response.status}`,
            { showInUserNotification: 'Information' }
        );
    }
}
