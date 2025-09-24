// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { showSignInPrompt } from '../ui/prompts';
import { WorkspaceManagerBase } from './WorkspaceManager';
import { WorkspaceTreeNode } from './treeNodes/WorkspaceTreeNode';
import { showCreateWorkspaceWizard } from '../ui/showCreateWorkspaceWizard';
import { IFabricApiClient, IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication/interfaces';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from './WorkspaceFilterManager';

let workspaceCommandDisposables: vscode.Disposable[] = [];

function registerCommand<T>(
    commandName: string,
    callback: (...args: any[]) => Promise<T>,
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
    telemetryService: TelemetryService  | null,
    logger: ILogger,
    workspaceFilterManager: IWorkspaceFilterManager
): void {

    // Dispose of any existing commands
    workspaceCommandDisposables.forEach(disposable => disposable.dispose());
    workspaceCommandDisposables = [];

    registerCommand(commandNames.signIn, async () => {
        await auth.signIn();
    }, context);

    registerCommand(commandNames.createWorkspace, async () => {
        return await createWorkspace(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
    }, context);

    registerCommand(commandNames.selectWorkspaceLocalFolder, async (treeNode?: WorkspaceTreeNode) => {
        await selectLocalFolder(workspaceManager, treeNode);
    }, context);

    registerCommand(commandNames.filterWorkspaces, async () => {
        await workspaceFilterManager.showWorkspaceFilterDialog();
    }, context);

    registerCommand(commandNames.clearWorkspaceFilter, async () => {
        await workspaceFilterManager.clearFilters();
    }, context);
}

/**
 * If logged in, allows the user to enter a the name of a new workspace to create along with the capacity to use for the new workspace
 * @param manager Handles the Fabric workspaces for the user
 */
async function createWorkspace(manager: WorkspaceManagerBase, workspaceFilterManager: IWorkspaceFilterManager, capacityManager: ICapacityManager, telemetryService: TelemetryService | null, logger: ILogger): Promise<IWorkspace | undefined> {
    try {
        if (!(await manager.isConnected())) {
            await showSignInPrompt();
            return;
        }

        const createdWorkspace: IWorkspace | undefined = await showCreateWorkspaceWizard(manager as unknown as IWorkspaceManager, capacityManager, telemetryService, logger);
        if (createdWorkspace) {
            await workspaceFilterManager.addWorkspaceToFilters(createdWorkspace.objectId);
        }

        return createdWorkspace;
    }
    catch (error: any) {
        void vscode.window.showErrorMessage(error.message);
        logger.reportExceptionTelemetryAndLog('createWorkspace', 'workspace/create', error, telemetryService);
    }
}

/**
 * If a workspace has been selected, shows the user to select a local folder to associate with the workspace
 * @param manager Handles the Fabric workspaces for the user
 * @param treeNode Optional workspace tree node from context menu, contains the workspace to associate with a local folder
 */
async function selectLocalFolder(manager: WorkspaceManagerBase, treeNode?: WorkspaceTreeNode): Promise<vscode.Uri | undefined> {
    if (!(await manager.isConnected())) {
        await showSignInPrompt();
        return;
    }

    // If called from context menu, use the workspace from the tree node
    if (treeNode && treeNode.workspace) {
        return await manager.promptForLocalFolder(treeNode.workspace);
    }

    // If called from command palette without workspace context, show an error message
    void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a workspace in the Fabric explorer to associate it with a local folder.'));
    return undefined;
}
