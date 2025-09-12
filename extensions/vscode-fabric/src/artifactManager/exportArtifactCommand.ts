import * as vscode from 'vscode';
import { IArtifact, IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { formatErrorResponse, succeeded } from '../utilities';
import { FabricError, TelemetryActivity, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../itemDefinition/ItemDefinitionWriter';

export async function exportArtifactCommand(
    artifact: IArtifact,
    workspaceManager: IWorkspaceManager,
    artifactManager: IArtifactManager,
    conflictDetector: IItemDefinitionConflictDetector,
    itemDefinitionWriter: IItemDefinitionWriter,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
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
            const conflicts = await conflictDetector.getConflictingFiles(response.parsedBody?.definition, targetFolder);
            if (conflicts.length > 0) {
                const confirm = await vscode.window.showWarningMessage(
                    vscode.l10n.t('The following files already exist and will be overwritten:\n{0}\nDo you want to continue?', conflicts.join('\n')),
                    { modal: true },
                    vscode.l10n.t('Yes')
                );
                if (confirm !== vscode.l10n.t('Yes')) {
                    throw new UserCancelledError('overwriteExportFiles');
                }
            }

            await itemDefinitionWriter.save(response.parsedBody?.definition, targetFolder);
            void vscode.window.showInformationMessage(vscode.l10n.t('Opened {0}', artifact.displayName));
            await vscode.commands.executeCommand('vscode.openFolder', targetFolder); // default to open in current window
        }
        catch (error: any) {
            if (error instanceof UserCancelledError) {
                throw error; // Let UserCancelledError propagate
            }
            throw new FabricError(
                vscode.l10n.t('Error opening {0}: {1}', artifact.displayName, error.message ?? 'Unknown error'),
                `Opening Artifact failed during save ${artifact.type}`,
                { showInUserNotification: 'Information' }
            );
        }
    }
    else {
        telemetryActivity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode,
        });

        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error opening {0}', artifact.displayName), response),
            response.parsedBody?.errorCode || `Opening Artifact failed ${artifact.type} ${response.status}`,
            { showInUserNotification: 'Information' }
        );
    }
}
