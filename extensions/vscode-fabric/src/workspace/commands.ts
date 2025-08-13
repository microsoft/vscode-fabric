import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { showSignInPrompt, showSelectWorkspacePrompt } from '../ui/prompts';
import { WorkspaceManagerBase } from './WorkspaceManager';

import { showCreateWorkspaceWizard } from '../ui/showCreateWorkspaceWizard';
import { showWorkspaceQuickPick } from '../ui/showWorkspaceQuickPick';
import { IFabricApiClient, IWorkspace } from '@fabric/vscode-fabric-api';
import { IAccountProvider, TelemetryService, ILogger } from '@fabric/vscode-fabric-util';
import { CapacityManager, ICapacityManager } from '../CapacityManager';

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
    capacityManager: ICapacityManager,
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
        await createWorkspace(workspaceManager, capacityManager, telemetryService, logger);
    }, context);

    registerCommand(commandNames.openWorkspace, async () => {
        await openWorkspace(workspaceManager, capacityManager, telemetryService, logger);
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
async function createWorkspace(manager: WorkspaceManagerBase, capacityManager: ICapacityManager, telemetryService: TelemetryService | null, logger: ILogger): Promise<void> {
    try {
        if (!(await manager.isConnected())) {
            await showSignInPrompt();
            return;
        }

        const createdWorkspace: IWorkspace | undefined = await showCreateWorkspaceWizard(manager, capacityManager, telemetryService, logger);
        if (createdWorkspace) {
            await manager.openWorkspaceById(createdWorkspace.objectId);
        }
    }
    catch (error: any) {
        void vscode.window.showErrorMessage(error.message);
        logger.reportExceptionTelemetryAndLog('createWorkspace', 'workspace/create', error, telemetryService);
    }
}

/**
 * If logged in, shows the user the available Fabric worskapces and allows for the selection of 1
 * @param manager Handles the Fabric workspaces for the user
 */
async function openWorkspace(
    manager: WorkspaceManagerBase, 
    capacityManager: ICapacityManager,
    telemetryService: TelemetryService | null, 
    logger: ILogger): Promise<void> {
    try {
        if (!(await manager.isConnected())) {
            await showSignInPrompt();
            return;
        }

        const selectedWorkspace = await showWorkspaceQuickPick(manager, capacityManager, telemetryService, logger);
        if (selectedWorkspace) {
            await manager.setCurrentWorkspace(selectedWorkspace);
            telemetryService?.sendTelemetryEvent('workspace/open', { workspaceId: manager.currentWorkspace!.objectId });
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
        await showSignInPrompt();
        return;
    }
    if (!manager.currentWorkspace) {
        await showSelectWorkspacePrompt();
        return;
    }

    return manager.promptForLocalFolder();
}

async function closeWorkspace(manager: WorkspaceManagerBase): Promise<void> {
    if (!(await manager.isConnected())) {
        await manager.closeWorkspace();
    }
}
