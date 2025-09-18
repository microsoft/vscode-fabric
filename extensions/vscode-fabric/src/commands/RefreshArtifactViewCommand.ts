import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { FabricCommand } from './FabricCommand';
import { IFabricCommandManager } from './IFabricCommandManager';
import { commandNames } from '../constants';

/**
 * Example command implementation for refreshing the artifact view
 * This demonstrates how to create a command using the new architecture
 */
export class RefreshArtifactViewCommand extends FabricCommand<'workspace/load-items'> {
    public readonly commandName = commandNames.refreshArtifactView;
    public readonly telemetryEventName = 'workspace/load-items' as const;

    constructor(commandManager: IFabricCommandManager) {
        super(commandManager);
    }

    protected async executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<void> {
        // Simple implementation - just refresh the data provider
        this.commandManager.dataProvider.refresh();

        // Log the action
        this.commandManager.logger.log(`RefreshArtifactView called ${Date()}`);

        // Add telemetry properties
        telemetryActivity.addOrUpdateProperties({
            displayStyle: 'tree', // or 'list' depending on current view
        });
    }

    /**
     * Override progress location to not show progress for this simple command
     */
    protected getProgressLocation(): any {
        // Return undefined to not show progress indicator for refresh commands
        return undefined;
    }
}
