import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { IAccountProvider, TelemetryService, ILogger, doCancelableActionWithErrorHandling, TelemetryActivity, TelemetryEventRecord } from '@fabric/vscode-fabric-util';
import { switchTenantCommand } from './switchTenantCommand';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';

let tenantCommandDisposables: vscode.Disposable[] = [];

function registerCommand(
    commandName: string,
    callback: () => Promise<void>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    tenantCommandDisposables.push(disposable);
}

export function registerTenantCommands(
    context: vscode.ExtensionContext,
    auth: IAccountProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger,
): void {
    // Dispose of any existing commands
    tenantCommandDisposables.forEach(disposable => disposable.dispose());
    tenantCommandDisposables = [];

    registerCommand(commandNames.switchTenant, async () => {
        await doCancelableActionWithErrorHandling(
            'switchTenant',
            'tenant/switch',
            logger,
            telemetryService,
            async (activity: TelemetryActivity<TelemetryEventRecord, string>) => {
                await switchTenantCommand(auth, activity);
            }
        );
    }, context);
}
