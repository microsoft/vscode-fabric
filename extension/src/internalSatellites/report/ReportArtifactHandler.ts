// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifactHandler, IItemDefinition, IApiClientRequestOptions, IArtifact, IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryService, UserCancelledError, ILogger } from '@microsoft/vscode-fabric-util';
import { IWorkspaceFilterManager } from '../../workspace/WorkspaceFilterManager';
import { showItemQuickPick } from '../../ui/showItemQuickPick';
import { Base64Encoder } from '../../itemDefinition/ItemDefinitionReader';
import { uint8ArrayToString, stringToUint8Array } from '../../bufferUtilities';

// custom metadata is no longer used; selection happens within onBeforeUpdateDefinition

/**
 * Artifact handler for Report artifacts handling datasetReference byPath resolution.
 * On updateDefinition we prompt user to choose a Semantic Model from the same workspace and
 * rewrite the definition.pbir file (if present) to ensure datasetReference.byPath points to the
 * relative .SemanticModel path sibling to the report folder.
 */
export class ReportArtifactHandler implements IArtifactHandler {
    public readonly artifactType: string = 'Report';
    private workspaceManager!: IWorkspaceManager;
    private artifactManager!: IArtifactManager;
    private workspaceFilterManager!: IWorkspaceFilterManager;
    private logger!: ILogger;

    private telemetryService: TelemetryService | null = null;

    public initialize(workspaceManager: IWorkspaceManager, artifactManager: IArtifactManager, telemetryService: TelemetryService | null, logger: ILogger, workspaceFilterManager: IWorkspaceFilterManager): void {
        this.workspaceManager = workspaceManager;
        this.artifactManager = artifactManager;
        this.workspaceFilterManager = workspaceFilterManager;
        this.logger = logger;
        this.telemetryService = telemetryService;
    }

    /**
     * Shared logic used by both create-with-definition and update-definition workflows.
     * Prompts user for a Semantic Model if the definition is not already bound byConnection
     * and updates definition.pbir accordingly.
     */
    private async ensureSemanticModelBinding(artifact: IArtifact, definition: IItemDefinition, userCancelledTag: string): Promise<void> {
        // If definition.pbir already has datasetReference.byConnection, no prompt or change needed
        const alreadyConnected = this.hasByConnection(definition);
        if (alreadyConnected) {
            return;
        }

        const workspace = await this.workspaceManager.getWorkspaceById(artifact.workspaceId);
        if (!workspace) {
            throw new FabricError(vscode.l10n.t('Workspace not found for report update.'), 'workspace-not-found');
        }

        const semanticModel: IArtifact | undefined = await showItemQuickPick(this.artifactManager, workspace, {
            filterTypes: ['SemanticModel'],
            placeHolder: vscode.l10n.t('Select a Semantic Model for the Report\'s dataset reference...'),
            title: vscode.l10n.t('Select a Semantic Model...'),
            workspaceManager: this.workspaceManager,
            workspaceFilterManager: this.workspaceFilterManager,
            telemetryService: this.telemetryService,
            logger: this.logger,
        });
        if (!semanticModel) {
            throw new UserCancelledError(userCancelledTag);
        }

        try {
            this.ensureDefinitionPbirUpdated(definition, semanticModel.id);
        }
        catch (err: unknown) {
            throw new FabricError(
                vscode.l10n.t('Failed to update Report definition: {0}', (err as Error)?.message || String(err)),
                'report-definition-update-failed'
            );
        }
    }

    public updateDefinitionWorkflow = {
        onBeforeUpdateDefinition: async (
            artifact: IArtifact,
            definition: IItemDefinition,
            _folder?: vscode.Uri,
            options?: IApiClientRequestOptions
        ): Promise<IApiClientRequestOptions> => {
            await this.ensureSemanticModelBinding(artifact, definition, 'updateDefinitionWorkflow');
            return options || {};
        },
    };

    public createWithDefinitionWorkflow = {
        onBeforeCreateWithDefinition: async (
            artifact: IArtifact,
            definition: IItemDefinition,
            _folder?: vscode.Uri,
            options?: IApiClientRequestOptions
        ): Promise<IApiClientRequestOptions> => {
            await this.ensureSemanticModelBinding(artifact, definition, 'createWithDefinitionWorkflow');
            return options || {};
        },
        // No onAfter hook currently required; creation long-running follow-up is handled by ArtifactManager
    };

    private ensureDefinitionPbirUpdated(definition: IItemDefinition, semanticModelId: string): void {
        const encoder = new Base64Encoder();
        const part = this.getDefinitionPbirPart(definition);
        let existing: any = {};

        if (part) {
            try {
                const decoded = encoder.decode(part.payload);
                const txt = uint8ArrayToString(decoded);
                existing = JSON.parse(txt);
            }
            catch {
                throw new FabricError(vscode.l10n.t('Failed to parse Report definition.'), 'report-definition-parse-failed');
            }
        }

        if (existing?.datasetReference?.byConnection) {
            return; // nothing to change
        }

        // Ensure schema to force new version that only includes connectionString
        existing.$schema = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json';

        // Update to byConnection using the selected Semantic Model ID
        existing.datasetReference = {
            byConnection: {
                connectionString: `semanticmodelid=${semanticModelId}`,
            },
        };

        const updatedContent: string = JSON.stringify(existing, undefined, 2);
        const newPayload = encoder.encode(stringToUint8Array(updatedContent));

        this.logger.log(`Updated Report definition.pbir to reference Semantic Model ${semanticModelId}`);
        this.logger.log(`New definition.pbir content: ${updatedContent}`);

        if (part) {
            part.payload = newPayload;
        }
        else {
            definition.parts = definition.parts || [];
            definition.parts.push({
                path: 'definition.pbir',
                payload: newPayload,
                payloadType: 'InlineBase64' as any,
            });
        }
    }

    private hasByConnection(definition: IItemDefinition): boolean {
        const encoder = new Base64Encoder();
        const part = this.getDefinitionPbirPart(definition);
        if (!part) {
            return false;
        }
        try {
            const decoded = encoder.decode(part.payload);
            const txt = uint8ArrayToString(decoded);
            const existing = JSON.parse(txt);
            return !!existing?.datasetReference?.byConnection;
        }
        catch {
            return false;
        }
    }

    private getDefinitionPbirPart(definition: IItemDefinition) {
        const parts = definition?.parts ?? [];
        return parts.find(p => p.path?.toLowerCase?.().endsWith('definition.pbir'));
    }
}
