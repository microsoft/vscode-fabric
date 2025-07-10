import * as vscode from 'vscode';
import { SqlExtension } from './database/SqlExtension';
import { NotebookExtension } from './notebook/NotebookExtension';
import { IFabricExtension } from '@fabric/vscode-fabric-api';
import { ILogger, TelemetryService } from '@fabric/vscode-fabric-util';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';

export interface IInternalSatelliteExtension extends IFabricExtension, vscode.Disposable {
    dispose: () => void;
}

export class InternalSatelliteManager {
    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        private logger: ILogger,
        private extensionManager: IFabricExtensionManagerInternal
    ) {       
    }    

    public readonly extensionClasses = [
        SqlExtension,
        NotebookExtension
    ];

    private extensionInstances: IInternalSatelliteExtension[] = [];

    public getSatelliteIds(): string[] {
        return this.extensionInstances.map((extension) => extension.identity);
    }

    public activateAll() {
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
            ),
        );
    }

    public dispose() {
        this.extensionInstances.forEach((extension) => extension.dispose());
    }
}