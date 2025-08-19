/* eslint-disable security/detect-non-literal-fs-filename */

import * as vscode from 'vscode';
import { IArtifact, IWorkspace, IApiClientRequestOptions, IApiClientResponse, IFabricApiClient, IWorkspaceManager, FabricTreeNode, ISourceControlInformation } from '@microsoft/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from './treeView';
import { LocalFolderManager } from '../LocalFolderManager';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { showLocalFolderQuickPick } from '../ui/showLocalFolderQuickPick';
import { isDirectory } from '../utilities';
import { IFabricEnvironmentProvider, FabricError, ILogger } from '@microsoft/vscode-fabric-util';
import { IAccountProvider, ITenantSettings } from '../authentication/interfaces';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

/**
 * Base class for managing the logged-in user's Fabric Workspace. Mock also inherits from this class. Put code common to both here
 */
export abstract class WorkspaceManagerBase implements IWorkspaceManager {
    protected disposables: vscode.Disposable[] = [];
    protected didInitializePriorState = false;
    public isProcessingAutoLogin = false;
    public readonly fabricWorkspaceContext = 'fabricWorkspaceContext';
    /**
     * The user's current workspace
     */
    private _currentWorkspace: IWorkspace | undefined;
    public get currentWorkspace(): IWorkspace | undefined {
        return this._currentWorkspace;
    }
    public async setCurrentWorkspace(value: IWorkspace | undefined) {
        this._currentWorkspace = value;
        if (value) {
            this.extensionSettingsStorage.mostRecentWorkspace = value.objectId;
            this.extensionSettingsStorage.settings.loginState = true; // user must be logged in, so let's remember in settings
            await this.extensionSettingsStorage.save();
            await this.refreshSourceControlInformation(this._currentWorkspace);
        }
        this._onDidChangePropertyValue.fire('currentWorkspace');
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
        protected logger: ILogger
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

    public async refreshConnectionToFabric(): Promise<boolean> {
        // not connected -> connected = new FabricClient, remove workspace
        // connected -> not connected = remove FabricClient, remove workspace
        // connected -> connected = new fabric client, remove workspace
        await this.closeWorkspace();
        if (await this.account.isSignedIn()) {
            await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'chooseWorkspace');
            this.didInitializePriorState = false;
            await this.initializePriorStateIfAny();
            return true;
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
            else {
                await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'chooseWorkspace'); // no context, so no Welcome View
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
            let showChooseWorkspace: boolean = false;

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
                if (!mostRecentWorkspace) {
                    showChooseWorkspace = true; // user was logged in, but didn't have a workspace, so show choose workspace
                }
                else {
                    console.log(`initializePriorStateIfAny opening ws=${mostRecentWorkspace}`);

                    // race condition: tvprovider is asked to show children, but we're in the process of getting the children, so it returns empty array
                    //  fix: set flag indicating we're getting data, and refresh
                    this.isProcessingAutoLogin = true; // set flag indicating we're getting workspace to prevent TVProvider showing "Choose Workspace"
                    await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'loadingWorkspace');
                    try {
                        await this.openWorkspaceById(mostRecentWorkspace);
                    }
                    catch (error) {
                        showChooseWorkspace = true; // probably because mostrecentworkspace is not found. Any failures, we want to show choose workspace. Not worth telemetry
                    }
                    if (!showChooseWorkspace) {
                        await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, ''); // no context, so no Welcome View
                        if (!this.isProcessingAutoLogin) { // if tvprovider returned 0 children we need to refresh
                            this.tvProvider?.refresh(); // need to refresh after getting workspace and tvprovider already said there are no children.
                            this.isProcessingAutoLogin = false;
                        }
                    }
                }
            }
            if (showChooseWorkspace) {
                await vscode.commands.executeCommand('setContext', this.fabricWorkspaceContext, 'chooseWorkspace');
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

    /**
     * Whether or not the user opened a specific Fabric workspace
     * 
     * @returns True if the user has opened a workspace; otherwise False
     */
    public isWorkspaceOpen(): boolean {
        return this.currentWorkspace !== undefined;
    }

    async closeWorkspace(): Promise<void> {
        await this.setCurrentWorkspace(undefined);
    }

    public dispose(): void {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    public async getLocalFolderForCurrentFabricWorkspace(options?: { createIfNotExists?: boolean } | undefined): Promise<vscode.Uri | undefined> {
        this.ensureCurrentWorkspace();

        let localWorkspaceFolder: vscode.Uri | undefined = await this.localFolderManager.getLocalFolderForFabricWorkspace(this.currentWorkspace!);
        if (!localWorkspaceFolder) {
            localWorkspaceFolder = await this.promptForLocalFolder();
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

    private ensureCurrentWorkspace(): IWorkspace {
        if (!this.currentWorkspace) {
            throw new FabricError(vscode.l10n.t('The current workspace has not been set'), 'The current workspace has not been set');
        }
        return this.currentWorkspace;
    }

    private async setLocalFolderForCurrentFabricWorkspace(newLocalFolder: vscode.Uri): Promise<void> {
        await this.localFolderManager.setLocalFolderForFabricWorkspace(this.ensureCurrentWorkspace(), newLocalFolder);
    }

    public async getLocalFolderForArtifact(artifact: IArtifact, options?: { createIfNotExists?: boolean } | undefined): Promise<vscode.Uri | undefined> {
        if (options?.createIfNotExists) {
            // Because the folder is getting created, the workspace folder must be set. 
            // Getting the workspace folder will verify it is already set or show UI to the user to set it.
            const localWorkspaceFolder: vscode.Uri | undefined = await this.getLocalFolderForCurrentFabricWorkspace();
            if (!localWorkspaceFolder) {
                // Getting back undefined here indicates the user did not want to set the folder at this time.
                // It is not possible to get the artifact folder without the workspace folder.
                return undefined;
            }
        }

        const localArtifactFolder: vscode.Uri | undefined = await this.localFolderManager.getLocalFolderForFabricArtifact(artifact);
        if (localArtifactFolder && options?.createIfNotExists && !(await isDirectory(vscode.workspace.fs, localArtifactFolder))) {
            // createDirectory will create all parent folders if they do not exist
            await vscode.workspace.fs.createDirectory(localArtifactFolder);
            if (!(await isDirectory(vscode.workspace.fs, localArtifactFolder))) {
                throw new Error(`Unable to create folder '${localArtifactFolder.fsPath}'`);
            }
        }

        return localArtifactFolder;
    }

    public async promptForLocalFolder(): Promise<vscode.Uri | undefined> {
        this.ensureCurrentWorkspace();
        let localWorkspaceFolder: vscode.Uri | undefined = await this.localFolderManager.getLocalFolderForFabricWorkspace(this.currentWorkspace!);
        if (!localWorkspaceFolder) {
            localWorkspaceFolder = this.localFolderManager.defaultLocalFolderForFabricWorkspace(this.currentWorkspace!);
        }

        const selectedFolder: vscode.Uri | undefined = await showLocalFolderQuickPick(localWorkspaceFolder, this.currentWorkspace!, this.gitOperator);
        if (selectedFolder) {
            await this.setLocalFolderForCurrentFabricWorkspace(selectedFolder);
        }
        return selectedFolder;
    }

    private async refreshSourceControlInformation(workspace: IWorkspace | undefined): Promise<void> {
        if (workspace) {
            const req: IApiClientRequestOptions = {
                pathTemplate: `/v1/workspaces/${workspace.objectId}/git/connection`, // API ref: https://learn.microsoft.com/en-us/rest/api/fabric/core/git/get-connection
                method: 'GET'
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

    public async getItemsInWorkspace(): Promise<IArtifact[]> {
        if (!this.currentWorkspace) {
            throw new Error('The current workspace has not been set before retrieving artifacts called');
        }
        const wspaceId = this.currentWorkspace.objectId;
        const res = await this.apiClient.sendRequest({
            method: 'GET',
            pathTemplate: `/v1/workspaces/${wspaceId}/items`
        });

        if (res.status !== 200) {
            // this will be caught by VSCode event handling and will show a VSCode.Error message, but we won't see it in the fabric log
            const errmsg = `Error retrieving Artifacts: ${res.status} ${res.bodyAsText ?? ''}`;
            this.logger.log(errmsg, undefined, true);
            throw new Error(errmsg);
        }

        let arrayArtifacts = res?.parsedBody;
        if (arrayArtifacts?.value) {    // Public API changed. Daily changed to put the array under 'value', but the change isn't in DXT yet, so we need to try both
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
                description: options?.description
            },
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json'
            }   
        };
        
        return this.apiClient.sendRequest(req);
    }

    abstract listWorkspaces(): Promise<IWorkspace[]>;
    abstract logToOutPutChannel(message: string): void;
    abstract openWorkspaceById(id: string): Promise<void>;
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
        gitOperator: IGitOperator
    ) {

        super(extensionSettingsStorage, localFolderManager, account, fabricEnvironmentProvider, apiClient, gitOperator, logger);
        /**
         * The context object can store workspaceState (for the current VSCode workspace) or globalState (stringifyable JSON)
         * When our extensions tries to open a VSCode Folder, our extension is deactivated 
         * (in fact, a whole new extensionhost process is spawned) 
         * and we want to re-initialize our state when the user re-activates us
         * So we save settings across activations
         */
    }

    public async refreshConnectionToFabric(): Promise<boolean> {
        await this.extensionSettingsStorage.load();

        return super.refreshConnectionToFabric();
    }

    /**
     * The set of all workspaces available to the logged in user. 
     * 
     * An error is issued if the user is not logged in
     * 
     * @returns The set of all workspaces available to the logged in user
     */
    public async listWorkspaces(): Promise<IWorkspace[]> {
        if (!(await this.isConnected())) {
            throw new FabricError(vscode.l10n.t('Currently not connected to Fabric'), 'Currently not connected to Fabric');
        }

        const res = await this.apiClient?.sendRequest({
            method: 'GET',
            pathTemplate: '/v1/workspaces',
        });
        if (res?.status !== 200) {
            throw new Error(`Error Getting Workspaces + ${res?.status}  ${res?.bodyAsText}`);
        }
        let arrayWSpaces = res?.parsedBody;
        if (arrayWSpaces?.value) { // Public API changed. Daily changed to put the array under 'value', but the change isn't in DXT yet, so we need to try both
            arrayWSpaces = arrayWSpaces.value;
        }
        if (!arrayWSpaces) {
            throw new Error('Get Workspace result parsedBody is null or undefined');
        }
        let workSpaces: IWorkspace[] = [];
        for (let item of arrayWSpaces) {
            const wspace: IWorkspace = {
                objectId: item.id,
                description: item.description,
                type: item.type,
                displayName: item.displayName,
                capacityId: item.capacityid
            };
            workSpaces.push(wspace);
        }
        return workSpaces;
    }

    logToOutPutChannel(message: string): void {
        this.logger.log(message, undefined, true);
    }

    public async openWorkspaceById(id: string): Promise<void> {
        if (!(await this.isConnected())) {
            await this.account.awaitSignIn();
        }

        const req: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${id}`, //API ref: https://review.learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/get-workspace?branch=drafts%2Ffeatures%2Fga-release&tabs=HTTP
            method: 'GET'
        };
        const response = await this.apiClient.sendRequest(req);

        if (response.status !== 200) {
            throw new Error(`Cannot find Workspace with id ${id}`);
        }
        const workspace: IWorkspace = {
            objectId: response.parsedBody.id,
            capacityId: response.parsedBody.capacityId,
            displayName: response.parsedBody.displayName,
            description: response.parsedBody.description,
            type: response.parsedBody.type
        };
        await this.setCurrentWorkspace(workspace);
    }
}
