// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { SqlExtension } from './database/SqlExtension';
import { NotebookExtension } from './notebook/NotebookExtension';
import { ReportExtension } from './report/ReportExtension';
import { SemanticModelExtension } from './semanticModel/SemanticModelExtension';
import { AppBackendExtension } from './appBackend/AppBackendExtension';
import { IFabricExtension } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';

export interface IInternalSatelliteExtension extends IFabricExtension, vscode.Disposable {
    dispose: () => void;
}

export class InternalSatelliteManager {
    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        private logger: ILogger,
        private extensionManager: IFabricExtensionManagerInternal,
        private workspaceFilterManager: IWorkspaceFilterManager
    ) {
    }

    public readonly extensionClasses = [
        SqlExtension,
        NotebookExtension,
        ReportExtension,
        SemanticModelExtension,
        AppBackendExtension,
    ];

    private extensionInstances: IInternalSatelliteExtension[] = [];

    public getSatelliteIds(): string[] {
        return this.extensionInstances.map((extension) => extension.identity);
    }

    public activateAll(fabricEnvironmentProvider: IFabricEnvironmentProvider) {
        this.extensionInstances.push(
            new SqlExtension(
                this.context,
                this.telemetryService,
                this.logger,
                this.extensionManager
            )
        );

        this.extensionInstances.push(
            new NotebookExtension(
                this.context,
                this.telemetryService,
                this.extensionManager
            )
        );

        this.extensionInstances.push(
            new ReportExtension(
                this.context,
                this.telemetryService,
                this.logger,
                this.workspaceFilterManager, // Regular satellites would not have access to this, but internal mini-satellite can cheat and take this dependency
                this.extensionManager
            )
        );

        this.extensionInstances.push(
            new SemanticModelExtension(
                this.context,
                this.extensionManager
            )
        );

        this.extensionInstances.push(
            new AppBackendExtension(
                this.context,
                this.extensionManager,
                fabricEnvironmentProvider,
                this.telemetryService
            )
        );
    }

    public dispose() {
        this.extensionInstances.forEach((extension) => extension.dispose());
    }
}
