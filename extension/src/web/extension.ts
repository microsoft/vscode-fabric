// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';

import { commandNames } from '../constants';

import {
    TelemetryService,
    ILogger,
    ConfigurationProvider,
    IConfigurationProvider,
    IDisposableCollection,
    DisposableCollection,
} from '@microsoft/vscode-fabric-util';

import { Logger, FabricEnvironmentProvider, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import TelemetryReporter from '@vscode/extension-telemetry';

import { DIContainer } from '@wessberg/di';
import { ITokenAcquisitionService, IAccountProvider } from '../authentication/interfaces';
import { AccountProvider } from '../authentication/AccountProvider';
import { TokenAcquisitionService, VsCodeAuthentication, DefaultVsCodeAuthentication } from '../authentication/TokenAcquisitionService';
import { FeedbackTreeDataProvider } from '../feedback/FeedbackTreeDataProvider';

let app: FabricVsCodeWebExtension;

/**
 * Activates the web version of the Fabric extension.
 * This is a simplified entry point for browser-based VS Code environments.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Register a simple hello world command
    const helloCommand = vscode.commands.registerCommand('vscode-fabric.helloWeb', async () => {
        await vscode.window.showInformationMessage('Hello from Fabric Web Extension! Running in: ' + vscode.env.uiKind);
    });

    context.subscriptions.push(helloCommand);

    const container = await composeContainer(context);
    app = new FabricVsCodeWebExtension(container);
    return await app.activate();
}

export async function deactivate() {
    // Clean shutdown
    if (app) {
        await app.deactivate();
    }
}

export class FabricVsCodeWebExtension {
    constructor(private readonly container: DIContainer) { }

    async activate(): Promise<void> {
        const context = this.container.get<ExtensionContext>();

        // Create feedback view
        context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.feedback', {
            treeDataProvider: new FeedbackTreeDataProvider(context),
        }));

        // register the signIn command
        const signInCommand = vscode.commands.registerCommand(commandNames.signIn, async () => {
            const auth = this.container.get<IAccountProvider>();
            await auth.signIn();
        });

        context.subscriptions.push(signInCommand);
    }

    async deactivate(): Promise<void> {
    }
}

async function composeContainer(context: vscode.ExtensionContext): Promise<DIContainer> {
    const container = new DIContainer();

    // Need to register as both ExtensionContext and vscode.ExtensionContext, bug in DIContainer?
    container.registerSingleton<ExtensionContext>(() => context);
    container.registerSingleton<vscode.ExtensionContext>(() => context);

    // Logger and TelemtryService are initialized at the very beginning to ensure we catch all errors
    container.registerSingleton<ILogger>(() => new Logger('Fabric'));
    container.registerSingleton<TelemetryReporter>(() => new TelemetryReporter(context.extension.packageJSON.aiKey));

    // Need to register the telemetry service as a singleton and as a singleton of type TelemetryService | null
    const telemetryService = new TelemetryService(container.get<TelemetryReporter>(), { extensionMode: context.extensionMode });
    container.registerSingleton<TelemetryService>(() => telemetryService);
    container.registerSingleton<TelemetryService | null>(() => telemetryService);

    /*
        context: vscode.ExtensionContext,
        + auth: IAccountProvider,
        + workspaceManager: WorkspaceManagerBase,
        capacityManager: ICapacityManager,
        + telemetryService: TelemetryService  | null,
        + logger: ILogger,
        workspaceFilterManager: IWorkspaceFilterManager,
        + fabricEnvironmentProvider: IFabricEnvironmentProvider
    */

    container.registerSingleton<IAccountProvider, AccountProvider>();
    container.registerSingleton<ITokenAcquisitionService, TokenAcquisitionService>();
    container.registerSingleton<IFabricEnvironmentProvider, FabricEnvironmentProvider>();
    container.registerSingleton<VsCodeAuthentication, DefaultVsCodeAuthentication>();

    container.registerSingleton<IConfigurationProvider, ConfigurationProvider>();
    container.registerTransient<IDisposableCollection, DisposableCollection>();
    
    return container;
}
