// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { NotSignedInError } from './NotSignedInError';
import { showCreateWorkspaceWizard } from './showCreateWorkspaceWizard';
import { IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

/**
 * Shows a selection list of available workspaces, including the option to create a new workspace.
 *
 * @param workspaceManager Lists available workspaces
 * @param capacityManager Lists available capacities
 * @param telemetryService The telemetry service
 * @param logger The logger
 *
 * @returns The selected workspace or undefined if cancelled
 *
 * @throws A {@link NotSignedInError} If the user is not signed in to Fabric.
 */
export async function showWorkspaceQuickPick(
    workspaceManager: IWorkspaceManager,
    workspaceFilterManager: IWorkspaceFilterManager | undefined,
    capacityManager: ICapacityManager | undefined,
    telemetryService: TelemetryService | null,
    logger?: ILogger
): Promise<IWorkspace | undefined> {
    if (!(await workspaceManager.isConnected())) {
        throw new NotSignedInError();
    }
    const allWorkspaces = await workspaceManager.listWorkspaces();

    // If filter manager not provided just treat all as "remaining" for a flat list.
    const filteredIdsSet = workspaceFilterManager
        ? new Set(workspaceFilterManager.getVisibleWorkspaceIds().filter(id => id !== '__HIDE_ALL__'))
        : new Set<string>();

    let filteredWorkspaces: IWorkspace[] = [];
    let remainingWorkspaces: IWorkspace[] = [];
    if (workspaceFilterManager && filteredIdsSet.size > 0) {
        for (const ws of allWorkspaces) {
            if (filteredIdsSet.has(ws.objectId)) {
                filteredWorkspaces.push(ws);
            }
            else {
                remainingWorkspaces.push(ws);
            }
        }
    }
    else {
        remainingWorkspaces = allWorkspaces.slice();
    }

    // Prepare QuickPick items
    const workspaceItems: (vscode.QuickPickItem & { workspace?: IWorkspace })[] = [];
    if (capacityManager) { // Only show create option if we can service it
        const createString = vscode.l10n.t('Create a new Fabric Workspace...');
        workspaceItems.push({ label: `$(add) ${createString}` });
    }

    // Add filtered workspaces
    for (const ws of filteredWorkspaces) {
        workspaceItems.push({ label: ws.displayName, workspace: ws });
    }

    // Add separator
    if (filteredWorkspaces.length > 0 && remainingWorkspaces.length > 0) {
        workspaceItems.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    }

    // Add remaining workspaces
    for (const ws of remainingWorkspaces) {
        workspaceItems.push({ label: ws.displayName, workspace: ws });
    }

    const titlePlaceholder = vscode.l10n.t('Select Fabric Workspace...');
    const pick = await vscode.window.showQuickPick(workspaceItems, { canPickMany: false, placeHolder: titlePlaceholder, title: titlePlaceholder });
    if (pick) {
        if (!('workspace' in pick)) {
            if (capacityManager) {
                // User selected the Create new workspace option
                return showCreateWorkspaceWizard(workspaceManager, capacityManager, telemetryService, logger);
            }
            return undefined; // create option not available (should not happen because not shown)
        }
        return pick.workspace;
    }
    return undefined;
}
