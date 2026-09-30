// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IFabricExtension, IFabricExtensionManager, ILocalProjectTreeNodeProvider } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, TelemetryService } from '@microsoft/vscode-fabric-util';
import { bindAppBackendServices, disposeCommands } from './commands';

export class AppBackendExtension implements IFabricExtension, vscode.Disposable {
    public identity: string = 'fabric.internal-satellite-appbackend';
    public apiVersion: string = apiVersion;
    public artifactTypes: string[] = ['AppBackend'];
    public localProjectTreeNodeProviders: ILocalProjectTreeNodeProvider[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManager,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        telemetryService: TelemetryService
    ) {
        extensionManager.addExtension(this);
        bindAppBackendServices(fabricEnvironmentProvider, telemetryService);
    }

    dispose() {
        disposeCommands();
    }
}
