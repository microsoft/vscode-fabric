import * as vscode from 'vscode';
import { TelemetryActivity, FabricCommandBase } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { IFabricCommandManager } from './IFabricCommandManager';
import { fabricViewWorkspace } from '../constants';

/**
 * Abstract base class for all Fabric commands that provides common error handling,
 * telemetry tracking, and dependency access functionality
 */
export abstract class FabricCommand<TEventName extends keyof CoreTelemetryEventNames = keyof CoreTelemetryEventNames>
extends FabricCommandBase<CoreTelemetryEventNames, TEventName, IFabricCommandManager> {

    /**
     * Override this method to specify a custom progress location for the command
     * Default shows progress in the Fabric workspace view
     */
    protected getProgressLocation(): vscode.ProgressLocation | { viewId: string } {
        return { viewId: fabricViewWorkspace };
    }

    /**
     * Helper method to add common telemetry properties for artifact operations
     */
    protected addArtifactTelemetryProperties(
        activity: TelemetryActivity<CoreTelemetryEventNames>,
        artifact: any
    ): void {
        activity.addOrUpdateProperties({
            endpoint: this.commandManager.fabricEnvironmentProvider.getCurrent().sharedUri,
            workspaceId: artifact.workspaceId,
            artifactId: artifact.id,
            fabricArtifactName: artifact.displayName,
            itemType: artifact.type,
        });
    }
}
