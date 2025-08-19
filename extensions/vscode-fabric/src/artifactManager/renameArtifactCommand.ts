import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { formatErrorResponse } from '../utilities';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';

export async function renameArtifactCommand(
    artifact: IArtifact,
    artifactManager: IArtifactManager,
    dataProvider: FabricWorkspaceDataProvider,
    activity: TelemetryActivity<CoreTelemetryEventNames>,
): Promise<void> {
    const displayName = artifact.displayName as string;
    const updatedDisplayName = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Enter Item Name'), value: displayName, title: vscode.l10n.t('Update Display Name') });
    if (!updatedDisplayName || updatedDisplayName === displayName) {
        throw new UserCancelledError();
    }
    
    const body = new Map<string, string>([
        ['displayName', updatedDisplayName]
    ]);
    const response = await artifactManager.updateArtifact(artifact, body);

    activity.addOrUpdateProperties({
        'statusCode': response?.status.toString(),
    });

    if (response.status === 200) {
        dataProvider.refresh();
        void vscode.window.showInformationMessage(vscode.l10n.t('Renamed \'{0}\' to \'{1}\'', displayName, updatedDisplayName));
    }
    else {
        activity.addOrUpdateProperties({
            'requestId': response.parsedBody?.requestId,
            'errorCode': response.parsedBody?.errorCode
        });

        throw new FabricError(
            formatErrorResponse(vscode.l10n.t('Error renaming {0}', artifact.displayName), response),
            response.parsedBody?.errorCode || 'Error renaming item',
            { showInUserNotification: 'Information' }
        );
    }
}
