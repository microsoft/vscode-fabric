// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { apiVersion, IArtifact, IArtifactHandler, IFabricExtension, IFabricExtensionServiceCollection, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { ObservableMap } from '../collections/ObservableMap';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { getArtifactExtensionId } from '../metadata/fabricItemUtilities';

const satelliteExtensionIds = [
    'fabric.vscode-fabric-functions',
    'fabric.vscode-testplatform',
    'ms-azuretools.vscode-cosmosdb',
];

const internalSatelliteIds = [
    'fabric.internal-satellite-notebook',
    'fabric.internal-satellite-sql',
    'fabric.internal-satellite-report',
    'fabric.vscode-tests',
];

export class FabricExtensionManager implements IFabricExtensionManagerInternal {

    constructor(private context: vscode.ExtensionContext, private telemetryService: TelemetryService | null, private logger: ILogger) {
    }

    protected extensions: IFabricExtension[] = [];
    protected allowedExtensions: string[] = [...satelliteExtensionIds, ...internalSatelliteIds];
    protected activatingExtensions: Map<string, PromiseLike<boolean>> = new Map();
    protected apiVersion: string = apiVersion;

    public readonly artifactHandlers: ObservableMap<string, IArtifactHandler> = new ObservableMap<string, IArtifactHandler>();
    public readonly treeNodeProviders: ObservableMap<string, IFabricTreeNodeProvider> = new ObservableMap<string, IFabricTreeNodeProvider>();
    public readonly localProjectTreeNodeProviders: ObservableMap<string, ILocalProjectTreeNodeProvider> = new ObservableMap<string, ILocalProjectTreeNodeProvider>();

    protected readonly onExtensionsUpdatedEmitter = new vscode.EventEmitter<void>();
    public readonly onExtensionsUpdated = this.onExtensionsUpdatedEmitter.event;

    protected _serviceCollection: IFabricExtensionServiceCollection | undefined;

    public addExtension(extension: IFabricExtension): IFabricExtensionServiceCollection {
        // Validation: Ensure the extension is allowed and installed
        if (!this.allowedExtensions.includes(extension.identity)) {
            throw new Error(`Extension ${extension.identity} is not allowed`);
        }

        if (!this.isAvailable(extension.identity) && !internalSatelliteIds.includes(extension.identity)) {
            throw new Error(`Extension ${extension.identity} is not installed`);
        }

        // A duplicated extension could mean that an allowed extension was spoofed. Remove all contributions from the duplicated extension and error
        const duplicatedExtension = this.extensions.find(e => e.identity === extension.identity);
        if (duplicatedExtension) {
            // Remove all of the contributions from the duplicated extension
            duplicatedExtension.artifactHandlers?.forEach(h => this.artifactHandlers.delete(h.artifactType));
            duplicatedExtension.treeNodeProviders?.forEach(p => this.treeNodeProviders.delete(p.artifactType));
            throw new Error(`Extension ${extension.identity} is already registered`);
        }

        // Validation: Ensure the extension is compatible with the current API version
        if (extension.apiVersion !== this.apiVersion) {
            // Convert version to major.minor
            const currentVersion = this.apiVersion.split('.').slice(0, 2).join('.');
            const extensionVersion = extension.apiVersion.split('.').slice(0, 2).join('.');
            if (currentVersion !== extensionVersion) {
                const errorMessage = this.buildVersionMismatchMessage(extension.identity);
                throw new Error(errorMessage);
            }
        }

        extension.artifactHandlers?.forEach(h => this.artifactHandlers.set(h.artifactType, h));
        extension.treeNodeProviders?.forEach(p => this.treeNodeProviders.set(p.artifactType, p));
        extension.localProjectTreeNodeProviders?.forEach(p => this.localProjectTreeNodeProviders.set(p.artifactType, p));

        this.extensions.push(extension);
        this.onExtensionsUpdatedEmitter.fire();

        if (!this._serviceCollection) {
            throw new Error('Service collection not set');
        }

        return this._serviceCollection;
    }

    public getFunctionToFetchCommonTelemetryProperties(): () => { [key: string]: string } {
        const lambda: () => { [key: string]: string } = () => {
            // this lambda is called by sat ext for every telemetry event
            if (!this.telemetryService) {
                this.logger.log('No telemetry service');
                return {};
            }
            return this.telemetryService?.defaultProps ?? {};
        };
        return lambda;
    }

    public getArtifactHandler(artifactType: string) {
        return this.artifactHandlers.get(artifactType);
    }

    public getTreeNodeProvider(artifactType: string): IFabricTreeNodeProvider | undefined {
        return this.treeNodeProviders.get(artifactType);
    }

    public getLocalProjectTreeNodeProvider(artifactType: string): ILocalProjectTreeNodeProvider | undefined {
        return this.localProjectTreeNodeProviders.get(artifactType);
    }

    set serviceCollection(value: IFabricExtensionServiceCollection) {
        this._serviceCollection = value;
    }

    public isAvailable(extensionId: string): boolean {
        // If extension is disabled in VS Code, it won't appear in the extensions list
        // If extension is not installed, it won't appear in the extensions list
        return !!vscode.extensions.getExtension(extensionId);
    }

    public isActive(extensionId: string): boolean {
        return vscode.extensions.getExtension(extensionId)?.isActive ?? false;
    }

    public async activateExtension(artifact: IArtifact): Promise<vscode.Extension<any> | undefined>;
    public async activateExtension(extensionId: string): Promise<vscode.Extension<any> | undefined>;
    public async activateExtension(extensionIdOrArtifact: IArtifact | string): Promise<vscode.Extension<any> | undefined>{
        let extensionId: string | undefined;

        if (typeof extensionIdOrArtifact !== 'string') {
            extensionId = getArtifactExtensionId(extensionIdOrArtifact);
        }
        else {
            extensionId = extensionIdOrArtifact;
        }

        // Important to not rethrow errors here, as we don't want to block functionality if an extension fails to activate
        try {
            // Additional check to ensure the extension is indeed missing
            if (!extensionId) {
                // No associated extension
                return undefined;
            }

            const extension = vscode.extensions.getExtension(extensionId);
            if (!extension) {
                // Extension not installed
                return undefined;
            }

            // If the extension is installed and active
            if (extension.isActive) {
                return extension;
            }

            if (!this.activatingExtensions.has(extensionId)) {
                const result = extension.activate().then(() => this.activatingExtensions.delete(extensionId), () => this.activatingExtensions.delete(extensionId));
                this.activatingExtensions.set(extensionId, result);
            }

            await this.activatingExtensions.get(extensionId);

            // After activation return the extension
            if (extension.isActive) {
                return extension;
            }
        }
        catch (error) {
            this.logger.warn(`Failed to activate extension ${extensionId}: ${(error as Error).message ?? (typeof error === 'string' ? error : 'Unknown error')}`);
        }
    }

    private buildVersionMismatchMessage(satelliteId: string): string {
        const satelliteExtension = vscode.extensions.getExtension(satelliteId);
        const satelliteVersion = formatVersion(satelliteExtension);
        const coreVersion = formatVersion(this.context.extension);

        return vscode.l10n.t(
            'Extension {0} (version {1}) is not compatible with Microsoft Fabric extension (version {2}). Use the latest release versions for both extensions',
            satelliteId,
            satelliteVersion,
            coreVersion
        );
    }
}

function formatVersion(extension: vscode.Extension<any> | undefined): string {
    if (!extension) {
        return 'unknown';
    }

    const version = extension.packageJSON.version ?? 'unknown';
    const isPreRelease = extension.packageJSON.preRelease ?? false;

    return `${version}${isPreRelease ? '-pre' : ''}`;
}
