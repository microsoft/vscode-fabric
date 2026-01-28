// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-non-literal-fs-filename */

import * as vscode from 'vscode';
import { IArtifact, IWorkspace, IApiClientRequestOptions, IApiClientResponse, IFabricApiClient, IWorkspaceManager, FabricTreeNode, ISourceControlInformation, IWorkspaceFolder } from '@microsoft/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from './treeView';
import { LocalFolderManager } from '../LocalFolderManager';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { showLocalFolderQuickPick } from '../ui/showLocalFolderQuickPick';
import { isDirectory } from '../utilities';
import { IFabricEnvironmentProvider, FabricError, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IFabricFeatureConfiguration } from '../settings/FabricFeatureConfiguration';
import { IAccountProvider, ITenantSettings } from '../authentication/interfaces';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';
import { ILocalFolderService, LocalFolderPromptMode } from '../LocalFolderService';

export class UnlicensedUserError extends Error {
    constructor() {
        super('User does not have a Fabric account');
        this.name = 'UnlicensedUserError';
    }
}

/**
 * Base class for managing the logged-in user's Fabric Workspace. Mock also inherits from this class. Put code common to both here
 */
export abstract class WorkspaceManagerBase implements IWorkspaceManager {
    protected disposables: vscode.Disposable[] = [];
    protected didInitializePriorState = false;
    public isProcessingAutoLogin = false;
    public readonly fabricWorkspaceContext = 'fabricWorkspaceContext';
    protected _workspacesCache: IWorkspace[] = [];

    /**
     * Gets a workspace by its ID from the workspace cache
     * @param workspaceId The ID of the workspace to retrieve
     * @returns The workspace if found, undefined otherwise
     */
    public async getWorkspaceById(workspaceId: string): Promise<IWorkspace | undefined> {
        const cachedWorkspace = this._workspacesCache.find(workspace => workspace.objectId === workspaceId);
        if (!cachedWorkspace && await this.isConnected()) {
            // Cache miss - make an API call and cache a successful result
            const response = await this.apiClient.sendRequest({
                method: 'GET',
                pathTemplate: `/v1/workspaces/${workspaceId}`,
            });
            if (response.status === 200 && response.parsedBody) {
                const item = response.parsedBody;
                const workspace: IWorkspace = {
                    objectId: item.id,
                    description: item.description,
                    type: item.type,
                    displayName: item.displayName,
                    capacityId: item.capacityId,
                };
                this._workspacesCache.push(workspace);
                return workspace;
            }
        }
        return cachedWorkspace;
    }

    public treeView: vscode.TreeView<FabricTreeNode> | undefined;
    public tvProvider: FabricWorkspaceDataProvider | undefined;

    constructor(
        protected extensionSettingsStorage: IFabricExtensionsSettingStorage,
        protected localFolderManager: LocalFolderManager,
        protected account: IAccountProvider,
        protected fabricEnvironmentProvider: IFabricEnvironmentProvider,
        protected apiClient: IFabricApiClient,
        protected gitOperator: IGitOperator,
        protected logger: ILogger,
        protected telemetryService: TelemetryService | null,
        protected featureConfiguration: IFabricFeatureConfiguration,
        protected localFolderService: ILocalFolderService
    ) {
        this.disposables.push(this.account.onSignInChanged(async () => {
            await this.refreshConnectionToFabric();
        }));
        this.disposables.push(this.account.onTenantChanged(async () => {
            await this.refreshConnectionToFabric();
        }));
        this.disposables.push(this.fabricEnvironmentProvider.onDidEnvironmentChange(async () => {
            await this.refreshConnectionToFabric();
        }));
    }

    public async refreshConnectionToFabric(afterSignUp: boolean = false): Promise<boolean> {
        // not connected -> connected = new FabricClient
        // connected -> not connected = remove FabricClient
        // connected -> connected = new fabric client
        await this.closeWorkspaces();
        if (await this.account.isSignedIn()) {
            this.didInitializePriorState = false;

            // Check if user has Fabric account by attempting to list workspaces
            try {
                await this.listWorkspaces();
                // Successfully listed workspaces, proceed with normal initialization
                if (afterSignUp) {
                    this.logger.info('User signed up for Fabric and is now connected');
                    this.telemetryService?.sendTelemetryEvent('fabric/signUpSuccessful');
                }
                await this.initializePriorStateIfAny();
                return true;
            }
            catch (error: any) {
                // Check if this is a 401 Unauthorized error (no Fabric account)
                const errorMessage = error?.message?.toLowerCase() || '';
                const errorStatus = error?.status || error?.statusCode;

                if (error instanceof UnlicensedUserError) {
                    this.logger.log('User does not have a Fabric account (401 response)');
                    if (afterSignUp) {
                        this.logger.error('User still unlicensed after sign up attempt');
                        this.telemetryService?.sendTelemetryEvent('fabric/signUpFailed');
                    }
                    await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'signin');
                    return false;
                }

                // For other errors, try to initialize anyway
                this.logger.log(`Error listing workspaces: ${errorMessage}`);
                await this.initializePriorStateIfAny();
                return true;
            }
        }
        else {
            // we're signing out. set context to show signin button
            await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'signin');
            return false;
        }
    }

    public clearPriorStateIfAny() { // if we're started from a URL, we don't want to use the prior state
        this.didInitializePriorState = true;
    }

    /**
     * if user was logged in last time, with a particular wspace, let's restore that view
     */
    public async initializePriorStateIfAny() {
        this.isProcessingAutoLogin = false;
        let showSignIn: boolean = true;
        try {
            if (!this.didInitializePriorState) {
                this.didInitializePriorState = true;
                showSignIn = await this.processAutoLogin();
                if (showSignIn) {
                    await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'signin');
                }
            }
        }
        catch (error) {
            console.log(`Error trying to restore prior settings ${error}`);
            if (showSignIn) {
                await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'signin');
            }
        }
    }

    /**
     * Attempts to automatically login the user, setting relevant workspace context depending on the user's status
     *
     * @returns True if the tree view should show the Login command; otherwise False
     */
    private async processAutoLogin(): Promise<boolean> {
        let showSignInButton = false;
        if (await this.account.isSignedIn()) {

            if (this.extensionSettingsStorage.settings.currentTenant) {
                // this will only be defined if the user has ever switched tenants
                // if it is, we need to make sure we're signed into that tenant, and set the state of AccountProvider

                const tenantId: string = this.extensionSettingsStorage.settings.currentTenant.tenantId;
                if (!await this.account.isSignedIn(tenantId)) {
                    this.logger.log(`Stored tenant ID ${tenantId} is not signed in. Showing sign in button.`);
                    showSignInButton = true;
                    return showSignInButton;
                }

                const availableTenants = await this.account.getTenants();
                if (!availableTenants.some((tenant: ITenantSettings) => tenant.tenantId === tenantId)) {
                    this.logger.log(`Stored tenant ID ${tenantId} is not available in the current account. Showing sign in button.`);
                    showSignInButton = true;
                    return showSignInButton;
                }

                // Only call signIn if currentTenant is undefined, otherwise we'll end up in a loop.
                const currentTenant = await this.account.getCurrentTenant();
                if (!currentTenant) {
                    await this.account.signIn(tenantId);
                }
            }

            if (this.extensionSettingsStorage.settings.loginState === true && this.extensionSettingsStorage.settings.workspaces.length > 0) { // last time, the user was logged in.
                const mostRecentWorkspace: string | undefined = this.extensionSettingsStorage.mostRecentWorkspace;

                console.log(`initializePriorStateIfAny opening ws=${mostRecentWorkspace}`);

                // race condition: tvprovider is asked to show children, but we're in the process of getting the children, so it returns empty array
                //  fix: set flag indicating we're getting data, and refresh
                this.isProcessingAutoLogin = true; // set flag indicating we're getting workspace to prevent TVProvider showing "Choose Workspace"
                await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'loadingWorkspace');

                await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, ''); // no context, so no Welcome View
                if (!this.isProcessingAutoLogin) { // if tvprovider returned 0 children we need to refresh
                    this.tvProvider?.refresh(); // need to refresh after getting workspace and tvprovider already said there are no children.
                    this.isProcessingAutoLogin = false;
                }
            }

        }
        else {
            showSignInButton = true; // user is not logged in, so show signin button
        }
        return showSignInButton;
    }

    /**
     * Signals that a property value has changed
     */
    protected _onDidChangePropertyValue = new vscode.EventEmitter<string>();
    public get onDidChangePropertyValue(): vscode.Event<string> {
        return this._onDidChangePropertyValue.event;
    }

    /**
     * Whether or not the user has logged in to Fabric
     *
     * @returns True if the user is connected to Fabric; otherwise False
     */
    public async isConnected(): Promise<boolean> {
        return this.account.isSignedIn();
    }

    async closeWorkspaces(): Promise<void> {
        this._workspacesCache = [];
        this._onDidChangePropertyValue.fire('allWorkspaces');
    }

    public dispose(): void {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    /**
     * @deprecated
     */
    public async getLocalFolderForFabricWorkspace(workspace: IWorkspace, options?: { createIfNotExists?: boolean } | undefined): Promise<vscode.Uri | undefined> {
        let localWorkspaceFolder: vscode.Uri | undefined = await this.localFolderManager.getLocalFolderForFabricWorkspace(workspace);
        if (!localWorkspaceFolder) {
            localWorkspaceFolder = await this.promptForLocalFolder(workspace);
        }

        if (localWorkspaceFolder && options?.createIfNotExists && !(await isDirectory(vscode.workspace.fs, localWorkspaceFolder))) {
            // createDirectory will create all parent folders if they do not exist
            await vscode.workspace.fs.createDirectory(localWorkspaceFolder);
            if (!(await isDirectory(vscode.workspace.fs, localWorkspaceFolder))) {
                throw new Error(`Unable to create folder '${localWorkspaceFolder}'`);
            }
        }

        return localWorkspaceFolder;
    }

    private ensureWorkspace(workspace: IWorkspace | undefined): IWorkspace {
        if (!workspace) {
            throw new FabricError(vscode.l10n.t('The workspace has not been set'), 'The workspace has not been set');
        }
        return workspace;
    }

    private async setLocalFolderForFabricWorkspace(workspace: IWorkspace, newLocalFolder: vscode.Uri): Promise<void> {
        await this.localFolderManager.setLocalFolderForFabricWorkspace(this.ensureWorkspace(workspace), newLocalFolder);
    }

    public async getLocalFolderForArtifact(artifact: IArtifact, options?: { createIfNotExists?: boolean }): Promise<vscode.Uri | undefined> {
        // The expectation for this API is that if the folder is getting created, the artifact folder must be set
        const result = await this.localFolderService.getLocalFolder(
            artifact,
            {
                prompt: options?.createIfNotExists ? LocalFolderPromptMode.discretionary : LocalFolderPromptMode.never,
                create: options?.createIfNotExists ?? false,
            }
        );

        return result?.uri;
    }

    public async promptForLocalFolder(workspace: IWorkspace): Promise<vscode.Uri | undefined> {
        this.ensureWorkspace(workspace);
        let localWorkspaceFolder: vscode.Uri | undefined = await this.localFolderManager.getLocalFolderForFabricWorkspace(workspace);
        if (!localWorkspaceFolder) {
            localWorkspaceFolder = this.localFolderManager.defaultLocalFolderForFabricWorkspace(workspace);
        }

        // Make sure the source control information is up-to-date prior to showing the folder picker
        await this.refreshSourceControlInformation(workspace);

        const selectedFolder: vscode.Uri | undefined = await showLocalFolderQuickPick(localWorkspaceFolder, workspace, this.gitOperator);
        if (selectedFolder) {
            await this.setLocalFolderForFabricWorkspace(workspace, selectedFolder);
        }
        return selectedFolder;
    }

    private async refreshSourceControlInformation(workspace: IWorkspace | undefined): Promise<void> {
        if (workspace) {
            const req: IApiClientRequestOptions = {
                pathTemplate: `/v1/workspaces/${workspace.objectId}/git/connection`, // API ref: https://learn.microsoft.com/en-us/rest/api/fabric/core/git/get-connection
                method: 'GET',
            };
            const response: IApiClientResponse = await this.apiClient.sendRequest(req);

            if (response.status === 200 && response.parsedBody?.gitConnectionState && response.parsedBody?.gitConnectionState !== 'NotConnected') {
                /**
                 * Information from the ALM APIs about the git provider
                 */
                interface GitProviderDetails {
                    organizationName?: string;
                    projectName?: string;
                    gitProviderType?: string;
                    repositoryName?: string;
                    branchName?: string;
                    directoryName?: string;
                }
                const gitProviderDetails: GitProviderDetails = response.parsedBody.gitProviderDetails;

                const sourceControlInformation: ISourceControlInformation = {
                    branchName: gitProviderDetails.branchName,
                    repository: `https://${gitProviderDetails.organizationName}.visualstudio.com/${gitProviderDetails.projectName}/_git/${gitProviderDetails.repositoryName}`,
                    directoryName: gitProviderDetails.directoryName,
                };
                workspace.sourceControlInformation = sourceControlInformation;
            }
        }
    }

    public async getFoldersInWorkspace(workspaceId: string): Promise<IWorkspaceFolder[]> {
        if (!this.featureConfiguration.isFolderGroupingEnabled()) {
            return [];
        }

        const folders: IWorkspaceFolder[] = [];
        let continuationToken: string | undefined;

        do {
            const continuationSuffix = continuationToken ? `?continuationToken=${continuationToken}` : '';
            const res = await this.apiClient.sendRequest({
                method: 'GET',
                pathTemplate: `/v1/workspaces/${workspaceId}/folders${continuationSuffix}`,
            });

            if (res.status !== 200) {
                const errmsg = `Error retrieving folders: ${res.status} ${res.bodyAsText ?? ''}`;
                this.logger.log(errmsg, undefined, true);
                throw new Error(errmsg);
            }

            const body = res.parsedBody ?? {};
            const rawFolders = Array.isArray(body?.value) ? body.value : Array.isArray(body) ? body : [];

            for (const item of rawFolders) {
                if (!item?.id || !item?.displayName || !item?.workspaceId) {
                    continue;
                }

                const folder: IWorkspaceFolder = {
                    id: item.id,
                    displayName: item.displayName,
                    workspaceId: item.workspaceId,
                    parentFolderId: item.parentFolderId,
                };
                folders.push(folder);
            }

            continuationToken = body?.continuationToken;
        } while (continuationToken);

        return folders;
    }

    public async getItemsInWorkspace(workspaceId: string): Promise<IArtifact[]> {
        const res = await this.apiClient.sendRequest({
            method: 'GET',
            pathTemplate: `/v1/workspaces/${workspaceId}/items`,
        });

        if (res.status !== 200) {
            // this will be caught by VSCode event handling and will show a VSCode.Error message, but we won't see it in the fabric log
            const errmsg = `Error retrieving Artifacts: ${res.status} ${res.bodyAsText ?? ''}`;
            this.logger.log(errmsg, undefined, true);
            throw new Error(errmsg);
        }

        let arrayArtifacts = res?.parsedBody;
        if (arrayArtifacts?.value) { // API response format may vary between environments, so we need to handle both direct array and nested 'value' property
            arrayArtifacts = arrayArtifacts.value;
        }
        let artifacts: IArtifact[] = arrayArtifacts;

        // loop through all the artifacts and set artifact.fabricEnvironment to the current fabric environment
        artifacts.forEach((artifact) => {
            artifact.fabricEnvironment = this.fabricEnvironmentProvider.getCurrent().env;
        });

        return artifacts;
    }

    public async createWorkspace(workspaceName: string, options?: { capacityId?: string; description?: string; }): Promise<IApiClientResponse> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }

        const req: IApiClientRequestOptions = {
            pathTemplate: '/v1/workspaces',
            method: 'POST',
            body: {
                displayName: workspaceName,
                capacityId: options?.capacityId,
                description: options?.description,
            },
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
        };

        return this.apiClient.sendRequest(req);
    }

    public async createFolder(workspaceId: string, folderName: string, parentFolderId?: string): Promise<IApiClientResponse> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }

        const body: { displayName: string; parentFolderId?: string } = {
            displayName: folderName,
        };

        if (parentFolderId) {
            body.parentFolderId = parentFolderId;
        }

        const req: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${workspaceId}/folders`,
            method: 'POST',
            body,
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
        };

        return this.apiClient.sendRequest(req);
    }

    public async deleteFolder(workspaceId: string, folderId: string): Promise<IApiClientResponse> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }

        const req: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${workspaceId}/folders/${folderId}`,
            method: 'DELETE',
        };

        return this.apiClient.sendRequest(req);
    }

    public async renameFolder(workspaceId: string, folderId: string, newDisplayName: string): Promise<IApiClientResponse> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }

        const req: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${workspaceId}/folders/${folderId}`,
            method: 'PATCH',
            body: {
                displayName: newDisplayName,
            },
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
        };

        return this.apiClient.sendRequest(req);
    }

    abstract listWorkspaces(): Promise<IWorkspace[]>;
    abstract logToOutPutChannel(message: string): void;
}
/**
 * Manages the logged-in user's Fabric Workspace
 */
export class WorkspaceManager extends WorkspaceManagerBase {

    constructor(account: IAccountProvider,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        extensionSettingsStorage: IFabricExtensionsSettingStorage,
        localFolderManager: LocalFolderManager,
        apiClient: IFabricApiClient,
        logger: ILogger,
        telemetryService: TelemetryService | null,
        gitOperator: IGitOperator,
        featureConfiguration: IFabricFeatureConfiguration,
        localFolderService: ILocalFolderService
    ) {

        super(extensionSettingsStorage, localFolderManager, account, fabricEnvironmentProvider, apiClient, gitOperator, logger, telemetryService, featureConfiguration, localFolderService);
        /**
         * The context object can store workspaceState (for the current VSCode workspace) or globalState (stringifyable JSON)
         * When our extensions tries to open a VSCode Folder, our extension is deactivated
         * (in fact, a whole new extensionhost process is spawned)
         * and we want to re-initialize our state when the user re-activates us
         * So we save settings across activations
         */
    }

    public async refreshConnectionToFabric(afterSignUp?: boolean): Promise<boolean> {
        await this.extensionSettingsStorage.load();

        return super.refreshConnectionToFabric(afterSignUp);
    }

    /**
     * The set of all workspaces available to the logged in user.
     *
     * An error is issued if the user is not logged in
     *
     * @returns The set of all workspaces available to the logged in user, sorted with personal workspaces first, then others, all alphabetically
     */
    public async listWorkspaces(): Promise<IWorkspace[]> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }
        // throw new Error('unlicensed');
        const res = await this.apiClient?.sendRequest({
            method: 'GET',
            pathTemplate: '/v1/workspaces',
        });
        if (res?.status !== 200) {
            if (res?.status === 401 && res?.bodyAsText?.toLowerCase().includes('usernotlicensed')) {
                throw new UnlicensedUserError();
            }

            throw new Error(`Error Getting Workspaces + ${res?.status}  ${res?.bodyAsText}`);
        }
        let arrayWSpaces = res?.parsedBody;
        if (arrayWSpaces?.value) {
            arrayWSpaces = arrayWSpaces.value;
        }
        if (!arrayWSpaces) {
            throw new Error('Get Workspace result parsedBody is null or undefined');
        }
        this._workspacesCache = [];
        for (let item of arrayWSpaces) {
            const wspace: IWorkspace = {
                objectId: item.id,
                description: item.description,
                type: item.type,
                displayName: item.displayName,
                capacityId: item.capacityId,
            };
            this._workspacesCache.push(wspace);
        }

        // Sort workspaces: personal workspaces first (alphabetically), then other workspaces (alphabetically)
        const personalWorkspaces = this._workspacesCache.filter(w => w.type === 'Personal').sort((a, b) => a.displayName.localeCompare(b.displayName));
        const otherWorkspaces = this._workspacesCache.filter(w => w.type !== 'Personal').sort((a, b) => a.displayName.localeCompare(b.displayName));

        this._workspacesCache = [...personalWorkspaces, ...otherWorkspaces];
        return this._workspacesCache;
    }

    logToOutPutChannel(message: string): void {
        this.logger.log(message, undefined, true);
    }
}
