import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { showPleaseSignInMessage, showSelectWorkspace } from '../artifactManager/commands';
import { WorkspaceManagerBase } from './WorkspaceManager';

import { IApiClientRequestOptions, IFabricApiClient, IApiClientResponse, IWorkspaceManager } from '@fabric/vscode-fabric-api';
import { IAccountProvider, TelemetryActivity, TelemetryService, doFabricAction, ILogger } from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';

interface ICapacity {
    displayName: string;
    id: string;
}

let workspaceCommandDisposables: vscode.Disposable[] = [];

function registerCommand(
    commandName: string,
    callback: () => Promise<void>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    workspaceCommandDisposables.push(disposable);
}

export function registerWorkspaceCommands(
    context: vscode.ExtensionContext,
    auth: IAccountProvider,
    workspaceManager: WorkspaceManagerBase,
    apiClient: IFabricApiClient,
    telemetryService: TelemetryService  | null, 
    logger: ILogger,
): void {

    // Dispose of any existing commands
    workspaceCommandDisposables.forEach(disposable => disposable.dispose());
    workspaceCommandDisposables = [];

    registerCommand(commandNames.signIn, async () => {
        await auth.signIn();
    }, context);

    registerCommand(commandNames.createWorkspace, async () => {
        await createWorkspace(workspaceManager, apiClient, telemetryService, logger);
    }, context);

    registerCommand(commandNames.openWorkspace, async () => {
        await openWorkspace(workspaceManager, telemetryService, logger);
    }, context);

    registerCommand(commandNames.closeWorkSpace, async () => {
        await closeWorkspace(workspaceManager);
    }, context);

    registerCommand(commandNames.selectWorkspaceLocalFolder, async () => {
        await selectLocalFolder(workspaceManager);
    }, context);
}

/**
 * If logged in, allows the user to enter a the name of a new workspace to create along with the capacity to use for the new workspace
 * @param manager Handles the Fabric workspaces for the user
 */
async function createWorkspace(manager: WorkspaceManagerBase, client: IFabricApiClient, telemetryService: TelemetryService | null, logger: ILogger): Promise<void> {
    try {
        if (!(await manager.isConnected())) {
            await showPleaseSignInMessage();
            return;
        }

        const capacities: ICapacity[] | undefined = await getCapacities(client);
        if (capacities) {
            const workspaceName = await vscode.window.showInputBox({ prompt: 'Name', value: 'Name this workspace', title: 'Create a workspace' });

            if (workspaceName) {
                const quickPickItems: CapacityQuickPickItem[] = [];
                capacities.forEach(capacity => quickPickItems.push(new CapacityQuickPickItem(capacity.displayName, capacity.id)));

                let selectedCapacity: CapacityQuickPickItem | undefined = quickPickItems[0];
                if (quickPickItems.length > 1) {
                    selectedCapacity = await vscode.window.showQuickPick(quickPickItems, { title: 'Choose Capacity...', canPickMany: false });
                }
                if (selectedCapacity) {
                    const reqCreateWorkspace: IApiClientRequestOptions = {
                        pathTemplate: '/v1/workspaces',
                        method: 'POST',
                        headers: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Content-Type': 'application/json; charset=utf-8',
                        },
                        body: {
                            displayName: workspaceName,
                            capacityId: selectedCapacity.id,
                        }
                    };

                    const createActivity = new TelemetryActivity<CoreTelemetryEventNames>('workspace/create', telemetryService);
                    await doFabricAction({ fabricLogger:logger, telemetryActivity: createActivity }, async () => {
                        const responseCreateWorkspace: IApiClientResponse = await client.sendRequest(reqCreateWorkspace);
                        createActivity.addOrUpdateProperties({
                            'statusCode': responseCreateWorkspace.status.toString()
                        });
                        if (responseCreateWorkspace.status === 201) {
                            const workspaceId = responseCreateWorkspace.parsedBody.id;
                            createActivity.addOrUpdateProperties({
                                'workspaceId': workspaceId,
                                'fabricWorkspaceName': workspaceName,
                            });
                            await manager.openWorkspaceById(workspaceId);
                        }
                        else {
                            throw new Error(`Unable to create workspace: '${responseCreateWorkspace.parsedBody?.message}'`);
                        }
                    });
                }
            }
        }
    }
    catch (error: any) {
        void vscode.window.showErrorMessage(error.message);
        logger.reportExceptionTelemetryAndLog('createWorkspace', 'workspace/create', error, telemetryService);
    }
}

async function getCapacities(client: IFabricApiClient): Promise<ICapacity[]> {
    const requestCapacities: IApiClientRequestOptions = {
        pathTemplate: '/v1/capacities'
    };

    const responseCapacities: IApiClientResponse = await client.sendRequest(requestCapacities);

    if (responseCapacities && responseCapacities.status === 200) {
        const parsedCapacities: any[] = responseCapacities.parsedBody.value;
        const capacities: ICapacity[] = parsedCapacities.map(capacity => ({
            displayName: capacity.displayName,
            id: capacity.id
        }));

        if (capacities.length === 0) {
            throw new Error('No capacities were found');
        }
        return capacities;
    }
    else {
        throw new Error(`Unable to get capacities: '${responseCapacities?.parsedBody?.message}'`);
    }
}

/**
 * If logged in, shows the user the available Fabric worskapces and allows for the selection of 1
 * @param manager Handles the Fabric workspaces for the user
 */
async function openWorkspace(manager: WorkspaceManagerBase, telemetryService: TelemetryService | null, logger: ILogger): Promise<void> {
    try {
        if (!(await manager.isConnected())) {
            await showPleaseSignInMessage();
            return;
        }

        let workspaces = await manager.getAllWorkspaces();
        if (workspaces && workspaces.length > 0) {
            // Sort all workspaces alphabetically
            workspaces = workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName));
            
            // Filter personal and non-personal workspaces
            const personalWorkspaces = workspaces.filter(w => w.type === 'Personal');
            const otherWorkspaces = workspaces.filter(w => w.type !== 'Personal');
            
            // Prepare items array with "Create new..." option first
            const workspaceItems: string[] = [];
            const createString = vscode.l10n.t('Create a new Fabric Workspace...');
            workspaceItems.push(`$(add) ${createString}`);
            
            // Add personal workspaces first, then others
            personalWorkspaces.forEach(w => workspaceItems.push(w.displayName));
            otherWorkspaces.forEach(w => workspaceItems.push(w.displayName));

            const pick: string | undefined = await vscode.window.showQuickPick(workspaceItems, { canPickMany: false, placeHolder: 'Select Fabric workspace' });
            if (pick) {
                for (const workspace of workspaces) {
                    if (workspace.displayName === pick) {
                        await manager.setCurrentWorkspace(workspace);
                        telemetryService?.sendTelemetryEvent('workspace/open', { workspaceId: manager.currentWorkspace!.objectId });
                        return;
                    }
                }

                await vscode.commands.executeCommand(commandNames.createWorkspace);
            }
        }
        else {
            throw new Error('Unable to find any workspaces');
        }
    }
    catch (error: any) {
        void vscode.window.showErrorMessage(error.message);
        logger.reportExceptionTelemetryAndLog('openWorkspace', 'workspace/open', error, telemetryService);
    }
}

/**
 * If a workspace has been selected, shows the user to select a local folder to associate with the workspace
 * @param manager Handles the Fabric workspaces for the user
 */
async function selectLocalFolder(manager: WorkspaceManagerBase): Promise<vscode.Uri | undefined> {
    if (!(await manager.isConnected())) {
        await showPleaseSignInMessage();
        return;
    }
    if (!manager.currentWorkspace) {
        await showSelectWorkspace();
        return;
    }

    return manager.promptForLocalFolder();
}

async function closeWorkspace(manager: WorkspaceManagerBase): Promise<void> {
    if (!(await manager.isConnected())) {
        await manager.closeWorkspace();
    }
}

class CapacityQuickPickItem implements vscode.QuickPickItem {
    constructor(public label: string, public id: string) {
    }

    description?: string;
    detail?: string;
}
