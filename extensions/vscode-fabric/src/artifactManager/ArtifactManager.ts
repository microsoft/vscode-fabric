import * as vscode from 'vscode';

import { IApiClientResponse, IArtifact, IWorkspace, IApiClientRequestOptions, IFabricApiClient, OperationRequestType, IArtifactHandler, IArtifactManager, ArtifactTreeNode, IWorkspaceManager, } from '@fabric/vscode-fabric-api';
import { doFabricAction, FabricError, IFabricEnvironmentProvider, ILogger, sleep, TelemetryActivity, TelemetryService, withErrorHandling } from '@fabric/vscode-fabric-util';
import { DefaultArtifactHandler } from '../DefaultArtifactHandler';
import { fabricViewWorkspace } from '../constants';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider } from '../workspace/treeView';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { handleArtifactCreationErrorAndThrow, handleLongRunningOperation, succeeded } from '../utilities';

export class ArtifactManager implements IArtifactManagerInternal {
    protected disposables: vscode.Disposable[] = [];

    constructor(protected extensionManager: IFabricExtensionManagerInternal,
        protected workspaceManager: IWorkspaceManager,
        protected fabricEnvironmentProvider: IFabricEnvironmentProvider,
        protected apiClient: IFabricApiClient,
        protected logger: ILogger,
        protected telemetryService: TelemetryService | null = null, // base class (for MockArtifactManager) can be null, but required for ArtifactManager Class
        protected dataProvider: FabricWorkspaceDataProvider
    ) {
    }

    protected getArtifactHandler(artifact: IArtifact): IArtifactHandler | undefined {
        return this.extensionManager.artifactHandlers.get(artifact.type);
    }

    protected get currentWorkspace(): IWorkspace {
        return this.workspaceManager.currentWorkspace!;
    }

    public dispose(): void {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    public async getArtifactPayload(artifact: IArtifact): Promise<any> {
        const resp = await this.getArtifactData(artifact);
        let payload: any = {};
        if (resp.parsedBody?.payloadContentType === 'InlineJson') {
            try {
                payload = JSON.parse(resp.parsedBody?.workloadPayload);
            }
            catch (error) {
                this.logger.reportExceptionTelemetryAndLog('getArtifactPayload', 'json-parse', error, this.telemetryService);
                throw error;
            }
        }
        else {
            if (!resp.parsedBody) { // for public API, it's the entire parsedBody
                throw new Error(`Could not get payload for ${artifact.displayName}`);
            }
            payload = resp.parsedBody;
        }
        return payload;
    }

    private currentContextMenuItemBeingExecuted = '';
    public async doContextMenuItem(cmdArgs: any[], description: string, callback: (item: ArtifactTreeNode | undefined) => Promise<void>): Promise<boolean> {
        let didit = false;
        await withErrorHandling(description, this.logger, this.telemetryService, async () => {
            await doFabricAction({ fabricLogger: this.logger }, async () => {
                if (this.currentContextMenuItemBeingExecuted.length === 0) {
                    try {
                        this.currentContextMenuItemBeingExecuted = description;
                        let item;
                        if (cmdArgs?.length > 0) {
                            item = cmdArgs[0] as ArtifactTreeNode;
                        }
                        await callback(item);
                        didit = true;
                    }
                    finally {
                        this.currentContextMenuItemBeingExecuted = '';
                    }
                }
                else {
                    throw new FabricError(vscode.l10n.t('Context menu action \'{0}\' ignored while already executing \'{1}\'', description, this.currentContextMenuItemBeingExecuted), 'Context menu action ignored');
                }
            });
        })();
        return didit;
    }

    public async createArtifactDeprecated(artifact: IArtifact): Promise<IApiClientResponse> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Creating "{0}"', artifact.displayName)
        }, async (progress, token) => {
            // todo: pass progress and token to satellite extensions
            progress.report({ increment: 0 });
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/create', this.telemetryService);
            return activity.doTelemetryActivity(async () => {
                const request: IApiClientRequestOptions =
                {
                    method: 'POST',
                    pathTemplate: `/v1/workspaces/${this.workspaceManager.currentWorkspace!.objectId}/items`,
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Content-Type': 'application/json',
                    },
                    body: {
                        displayName: artifact.displayName,
                        description: artifact.description,
                        type: artifact.type,
                    }
                };

                // Get the custom Artifact Handler class to which we delegate any custom CRUD operations
                let artifactHandler = this.getArtifactHandler(artifact);
                if (artifactHandler?.onBeforeRequest) {
                    // The OperationRequestType.create is deprecated and will be removed in the future
                    await artifactHandler.onBeforeRequest(OperationRequestType.create, artifact, request); // this call asks runtime, creates the local folder
                }
                progress.report({ increment: 20 });

                let response = await this.apiClient.sendRequest(request); // returns 202 Accepted if successful

                activity.addOrUpdateProperties({
                    'endpoint': this.fabricEnvironmentProvider.getCurrent().sharedUri,
                    'fabricArtifactName': artifact.displayName,
                    'fabricWorkspaceName': this.workspaceManager.currentWorkspace!.displayName,
                    'statusCode': response?.status.toString(),
                    'workspaceId': artifact.workspaceId,
                    'itemType': artifact.type,
                });
                if (!succeeded(response)) { // 202==Accepted, 201 = Created
                    await handleArtifactCreationErrorAndThrow(response, artifact.displayName, artifact.type, activity);
                }
                if (response.parsedBody?.id) {
                    artifact.id = response.parsedBody.id;
                    activity.addOrUpdateProperties({
                        'artifactId': artifact.id
                    });
                }
                if (artifactHandler?.onAfterRequest) {
                    // The OperationRequestType.create is deprecated and will be removed in the future
                    progress.report({ increment: 30, message: vscode.l10n.t('Opening') });
                    await artifactHandler.onAfterRequest(OperationRequestType.create, artifact, response);
                }
                else {
                    progress.report({ increment: 100, message: vscode.l10n.t('CreateArtifact {0} succeeded', artifact.displayName) });
                }

                // if it's a UserDataFunction, VSCode opens a new folder, and thus all extensions are destroyed/recreated, so this code only runs for non-funcsets
                if (response.status === 202) {
                    await sleep(5000); // sleep before we refresh the treeview
                }
                this.dataProvider.refresh();
                return response;
            });
        });
    }

    public async createArtifact(artifact: IArtifact, itemSpecificMetadata: any | undefined): Promise<IApiClientResponse> {
        const request: IApiClientRequestOptions =
        {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
            body: {
                displayName: artifact.displayName,
                description: artifact.description,
                type: artifact.type,
            }
        };

        // Get the custom Artifact Handler to delegate any custom CRUD operations
        const artifactHandler = this.extensionManager.getArtifactHandler(artifact.type);
        if (artifactHandler?.createWorkflow?.onBeforeCreate) {
            await artifactHandler.createWorkflow.onBeforeCreate(artifact, request, itemSpecificMetadata);
        }

        const response = await this.apiClient.sendRequest(request); // returns 202 Accepted if successful

        if (artifactHandler?.createWorkflow?.onAfterCreate) {
            await artifactHandler.createWorkflow.onAfterCreate(artifact, itemSpecificMetadata, response);
        }

        return response;
    }

    public async getArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        // If the handler has a readWorkflow with onBeforeRead, call it before sending the request
        const pathTemplate = `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`;
        let options: IApiClientRequestOptions = {
            method: 'GET',
            pathTemplate: pathTemplate
        };

        // Get the custom Artifact Handler to delegate any custom CRUD operations
        const artifactHandler = this.extensionManager.getArtifactHandler(artifact.type);
        if (artifactHandler?.readWorkflow?.onBeforeRead) {
            options = await artifactHandler.readWorkflow.onBeforeRead(artifact, options);
        }

        return await this.apiClient.sendRequest(options);
    }

    public async updateArtifact(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse> {
        const options: IApiClientRequestOptions =
        {
            method: 'PATCH',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: Object.fromEntries(body)
        };

        const response = await this.apiClient.sendRequest(options);
        return response;
    }

    public async deleteArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        const options: IApiClientRequestOptions =
        {
            method: 'DELETE',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`
        };

        const response = await this.apiClient.sendRequest(options);
        return response;
    }

    public async getArtifactDefinition(artifact: IArtifact): Promise<IApiClientResponse> {
        const options: IApiClientRequestOptions =
        {
            method: 'POST',
            pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}/getDefinition`
        };

        const response = await this.apiClient.sendRequest(options);
        return handleLongRunningOperation(this.apiClient, response);
    }

    public shouldUseDeprecatedCommand(artifactType: string, operationRequestType: OperationRequestType): boolean {
        const handler = this.extensionManager.getArtifactHandler(artifactType);
        if (!handler) {
            return false;
        }

        if (operationRequestType === OperationRequestType.create && handler.createWorkflow) {
            return false;
        }

        return !!handler?.onBeforeRequest || !!handler?.onAfterRequest;
    }

    // TODO: This is unused?
    public async updateArtifactDeprecated(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse> {
        return await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/update', this.telemetryService);
            return activity.doTelemetryActivity(async () => {
                const options: IApiClientRequestOptions =
                {
                    method: 'PATCH',
                    pathTemplate: `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`,
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: Object.fromEntries(body)
                };

                const artifactHandler = this.getArtifactHandler(artifact);
                if (artifactHandler?.onBeforeRequest) {
                    await artifactHandler?.onBeforeRequest(OperationRequestType.update, artifact, options);
                }
                //progress.report({ increment: 40, message: "Starting to send " + artifact.displayName });
                const response = await this.apiClient.sendRequest(options);
                //progress.report({ increment: 90, message: "Received response " + artifact.displayName });
                activity.addOrUpdateProperties({
                    'endpoint': this.fabricEnvironmentProvider.getCurrent().sharedUri,
                    'statusCode': response?.status.toString(),
                    'workspaceId': artifact.workspaceId,
                    'artifactId': artifact.id,
                    'fabricArtifactName': artifact.displayName,
                    'fabricWorkspaceName': this.workspaceManager.currentWorkspace!.displayName,
                    'itemType': artifact.type
                });
                if (response.status !== 200) {
                    activity.addOrUpdateProperties({
                        'requestId': response.parsedBody?.requestId,
                        'errorCode': response.parsedBody?.errorCode
                    });
                    throw new Error(`UpdateArtifact failed: ${response.parsedBody?.error}`);
                }
                else {
                    if (artifactHandler?.onAfterRequest) {
                        await artifactHandler?.onAfterRequest(OperationRequestType.update, artifact, response);
                    }
                    void vscode.window.showInformationMessage(vscode.l10n.t('Updated {0} {1}', artifact.displayName, response.bodyAsText || ''));
                    await sleep(5000); // wait til the update takes affect
                    this.dataProvider.refresh();
                }
                return response;
            });
        });
    }

    public async getArtifactData(
        artifact: IArtifact,
        beforeaction?: (artifact: IArtifact, options: IApiClientRequestOptions) => Promise<void> | undefined,
        afterAction?: (artifact: IArtifact, response: IApiClientResponse) => Promise<void> | undefined
    ): Promise<IApiClientResponse> {
        const artifactHandler = this.getArtifactHandler(artifact);
        let pathTemplate: string;
        switch (artifactHandler?.artifactType) {
            case 'UserDataFunction':
                pathTemplate = `/v1/workspaces/${artifact.workspaceId}/userdatafunctions/${artifact.id}/__private/functions/metadata`;
                break;
            default:
                pathTemplate = `/v1/workspaces/${artifact.workspaceId}/items/${artifact.id}`;
                break;
        }
        const options: IApiClientRequestOptions =
        {
            method: 'GET',
            pathTemplate: pathTemplate
        };
        if (beforeaction) {
            await beforeaction(artifact, options);
        }
        const response = await this.apiClient.sendRequest(options);
        if (response?.status !== 200) {
            throw new FabricError(
                vscode.l10n.t('Error getting Artifact data for \'{0}\' Status = {1} {2}', artifact.displayName, response.status, response.response?.bodyAsText ?? ''),
                'Error getting Artifact data');
        }
        if (afterAction) {
            await afterAction(artifact, response);
        }
        return response;
    }

    public async selectArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        return await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {

            const artifactHandler = this.getArtifactHandler(artifact);

            const response = this.getArtifactData(artifact,
                async (artifact, options) => {
                    if (artifactHandler?.onBeforeRequest) {
                        await artifactHandler?.onBeforeRequest(OperationRequestType.select, artifact, options);
                    }

                },
                async (artifact, response) => {
                    if (response.status === 200 && response.parsedBody) {
                        if (artifactHandler?.onAfterRequest) {
                            await artifactHandler?.onAfterRequest(OperationRequestType.select, artifact, response);
                        }
                        else {
                            const defaultHandler = new DefaultArtifactHandler();
                            await defaultHandler.onAfterRequest(OperationRequestType.select, artifact, response);
                        }
                    }
                    else {
                        return Promise.reject(new Error(`SelectArtifact ${artifact.displayName} failed: ${response.response?.bodyAsText}`));
                    }
                }
            );

            return response;
        });
    }

    public async openArtifact(artifact: IArtifact): Promise<void> {
        return await vscode.window.withProgress({ location: { viewId: fabricViewWorkspace } }, async () => {
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('item/open', this.telemetryService);
            return activity.doTelemetryActivity(async () => {
                const artifactHandler = this.getArtifactHandler(artifact);
                if (artifactHandler?.onOpen) {
                    activity.addOrUpdateProperties({
                        'workspaceId': artifact.workspaceId,
                        'artifactId': artifact.id,
                        'fabricArtifactName': artifact.displayName,
                        'fabricWorkspaceName': this.workspaceManager.currentWorkspace!.displayName,
                        'itemType': artifact.type
                    });

                    // Allow the user to select the local workspace folder if it hasn't been set yet
                    // This will ensure the user has a local folder to open the artifact in
                    let localFolder: vscode.Uri | undefined = await this.workspaceManager.getLocalFolderForCurrentFabricWorkspace();
                    if (!localFolder) {
                        throw new FabricError(vscode.l10n.t('User canceled Open Artifact'), 'User canceled Open Artifact', { showInUserNotification: 'Information' });
                    }

                    const targetFolder: vscode.Uri | undefined = await this.workspaceManager.getLocalFolderForArtifact(artifact, { createIfNotExists: true });
                    const openSuccessful: boolean = await artifactHandler.onOpen(artifact, { folder: targetFolder! });
                    if (openSuccessful) {
                        await vscode.commands.executeCommand('vscode.openFolder', targetFolder!); // default to open in current window
                    }
                }
            });
        });
    }
}
