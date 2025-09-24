// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager, IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { showWorkspaceQuickPick } from './showWorkspaceQuickPick';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';
import { ICapacityManager } from '../CapacityManager';

export interface IShowItemQuickPickOptions {
    filterTypes?: string[]; // Only include these artifact types (if provided)
    placeHolder?: string;
    title?: string;
    /**
     * Optional workspace selection support. If a workspaceManager is provided, an entry to
     * choose artifacts from another workspace will be prepended (similar to how the create
     * workspace option is conditionally shown when capacityManager is provided in showWorkspaceQuickPick).
     */
    workspaceManager?: IWorkspaceManager; // Enables the "Choose from another workspace" option.
    workspaceFilterManager?: IWorkspaceFilterManager; // forwarded to showWorkspaceQuickPick
    capacityManager?: ICapacityManager; // forwarded if you want create workspace option in nested pick
    telemetryService?: TelemetryService | null; // forwarded
    logger?: ILogger; // forwarded (required by showWorkspaceQuickPick; a no-op will be used if omitted)
}

/**
 * Shows a quick pick list of artifacts in the specified workspace.
 * Can be filtered by artifact types.
 *
 * @param artifactManager The artifact manager used to list artifacts.
 * @param workspace The workspace whose artifacts should be listed.
 * @param options Optional filtering and UI customization options.
 * @returns The selected artifact or undefined if cancelled or none found.
 */
export async function showItemQuickPick(
    artifactManager: IArtifactManager,
    workspace: IWorkspace,
    options?: IShowItemQuickPickOptions
): Promise<IArtifact | undefined> {
    let artifacts: IArtifact[] = [];
    try {
        artifacts = await artifactManager.listArtifacts(workspace);
    }
    catch (err: unknown) {
        const message: string = err instanceof Error ? err.message : String(err);
        throw new FabricError(vscode.l10n.t('Failed to list items: {0}', message), 'list-items-failed');
    }

    if (options?.filterTypes && options.filterTypes.length > 0) {
        const filterSet: Set<string> = new Set(options.filterTypes.map(t => t.toLowerCase()));
        artifacts = artifacts.filter(a => filterSet.has(a.type.toLowerCase()));
    }

    const hasArtifacts = artifacts.length > 0;
    if (!hasArtifacts && !options?.workspaceManager) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No items found.'));
        return undefined;
    }

    const qpItems: (vscode.QuickPickItem & { artifact?: IArtifact; _chooseOtherWorkspace?: boolean })[] = [];

    // Prepend the "choose from another workspace" option if a workspaceManager was provided.
    if (options?.workspaceManager) {
        qpItems.push({
            label: vscode.l10n.t('$(organization) Choose from another Workspace...'),
            _chooseOtherWorkspace: true,
        });
        if (hasArtifacts) {
            qpItems.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }
    }

    if (hasArtifacts) {
        qpItems.push(
            ...artifacts.map(a => ({
                label: a.displayName || a.id,
                description: a.type,
                artifact: a,
            }))
        );
    }

    const pick = await vscode.window.showQuickPick(qpItems, {
        canPickMany: false,
        placeHolder: options?.placeHolder || vscode.l10n.t('Select item'),
        title: options?.title,
        matchOnDescription: true,
    });
    if (!pick) {
        return undefined; // cancelled
    }
    if ('artifact' in pick && pick.artifact) {
        return pick.artifact;
    }

    if ('_chooseOtherWorkspace' in pick && pick._chooseOtherWorkspace && options?.workspaceManager) {
        // Forward to workspace quick pick (no create option unless capacityManager provided in options)
        const logger: ILogger | undefined = options.logger;
        const otherWorkspace = await showWorkspaceQuickPick(
            options.workspaceManager,
            options.workspaceFilterManager,
            options.capacityManager, // could be undefined (then create not shown)
            options.telemetryService ?? null,
            logger as ILogger // assume provided if needed
        );
        if (!otherWorkspace) {
            return undefined;
        }
        // Recurse without workspaceManager to avoid infinite loop (or keep if we want repeat). We'll remove to prevent nested loops.
        const { workspaceManager: _wm, ...rest } = options;
        return showItemQuickPick(artifactManager, otherWorkspace, { ...rest });
    }
    return undefined;
}
