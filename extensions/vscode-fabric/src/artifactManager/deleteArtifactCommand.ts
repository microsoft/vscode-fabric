import * as vscode from 'vscode';
import { IApiClientResponse, IArtifact, IArtifactManager, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { isDirectory, succeeded, workspaceContainsDirectory } from '../utilities';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { formatErrorResponse } from '../utilities';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';

export async function deleteArtifactCommand(
    artifact: IArtifact,
    artifactManager: IArtifactManager,
    workspaceManager: IWorkspaceManager,
    fileSystem: vscode.FileSystem,
    telemetryService: TelemetryService | null,
    logger: ILogger,
    dataProvider: FabricWorkspaceDataProvider,
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>
): Promise<void> {
    let msg = vscode.l10n.t(
        'Are you sure you want to permanently delete "{0}"? This item cannot be recovered after deletion.',
        artifact.displayName
    );

    const messageItems: ICommandAction<IArtifact>[] = [];
    const localFolder = await workspaceManager.getLocalFolderForArtifact(artifact, { createIfNotExists: false });
    let cancelContext: string | undefined = undefined;

    if (localFolder && await isDirectory(fileSystem, localFolder)) {
        cancelContext = 'folderOpened';
        msg = vscode.l10n.t(
            'Do you want to permanently delete "{0}" from the remote workspace only or delete the local folder as well?',
            artifact.displayName
        );
        messageItems.push(new DeleteArtifactRemoteOnlyAction(vscode.l10n.t('Remote Only'), artifactManager, dataProvider, telemetryActivity, telemetryService, logger));
        messageItems.push(new DeleteArtifactAllAction(vscode.l10n.t('Local and Remote'), artifactManager, dataProvider, telemetryActivity, localFolder, fileSystem, telemetryService, logger));
    }
    else {
        cancelContext = 'remoteOnly';
        messageItems.push(new DeleteArtifactRemoteOnlyAction(vscode.l10n.t('Delete'), artifactManager, dataProvider, telemetryActivity, telemetryService, logger));
    }

    const result = await vscode.window.showWarningMessage(msg, { modal: true }, ...messageItems);
    if (!result) {
        throw new UserCancelledError(cancelContext);
    }

    await result.execute(artifact);
}

interface ICommandAction<T> extends vscode.MessageItem {
    execute(target: T): Promise<void>;
}

export class DeleteArtifactRemoteOnlyAction implements ICommandAction<IArtifact> {
    constructor(
        public title: string,
        protected artifactManager: IArtifactManager,
        protected dataProvider: FabricWorkspaceDataProvider,
        protected telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        protected telemetryService: TelemetryService | null,
        protected logger: ILogger
    ) {
        this.title = title;
    }

    async execute(artifact: IArtifact): Promise<void> {
        const response: IApiClientResponse = await this.artifactManager.deleteArtifact(artifact);
        this.telemetryActivity?.addOrUpdateProperties({
            'statusCode': response.status.toString(),
        });

        if (succeeded(response)) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Deleted {0}', artifact.displayName));
            this.dataProvider.refresh();
        }
        else {
            this.telemetryActivity?.addOrUpdateProperties({
                'requestId': response.parsedBody?.requestId,
                'errorCode': response.parsedBody?.errorCode,
            });
            throw new FabricError(
                formatErrorResponse(vscode.l10n.t('Error deleting {0}', artifact.displayName), response),
                response.parsedBody?.errorCode || 'Error deleting item',
                { showInUserNotification: 'Information' }
            );
        }
    }
}

class DeleteArtifactAllAction extends DeleteArtifactRemoteOnlyAction {
    constructor(
        public title: string,
        artifactManager: IArtifactManager,
        dataProvider: FabricWorkspaceDataProvider,
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        private localFolder: vscode.Uri,
        private fileSystem: vscode.FileSystem,
        telemetryService: TelemetryService | null,
        logger: ILogger
    ) {
        super(title, artifactManager, dataProvider, telemetryActivity, telemetryService, logger);
    }

    async execute(artifact: IArtifact): Promise<void> {
        // Check if the localFolder is contained in the workspace folders
        if (workspaceContainsDirectory(this.localFolder)) {
            void vscode.window.showWarningMessage(
                vscode.l10n.t('Unable to delete item "{0}" because the local folder "{1}" is currently open in the workspace. Please close the folder and try again.',
                    artifact.displayName,
                    this.localFolder.fsPath),
                { modal: false }
            );
            throw new UserCancelledError('folderActive');
        }

        await super.execute(artifact);
        try {
            // Delete the local folder associated with the artifact
            await this.fileSystem.delete(this.localFolder, { recursive: true, useTrash: true });
        }
        catch (error: any) {
            this.logger.reportExceptionTelemetryAndLog('deleteArtifact', 'fileSystem.delete', error, this.telemetryService);
            void vscode.window.showInformationMessage(vscode.l10n.t('Failed to delete local folder for {0}: {1}', artifact.displayName, error.message ?? 'Unknown error'));
        }
    }
}
