// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode, IArtifact } from '@microsoft/vscode-fabric-api';
import { IArtifactChildNodeProvider } from './IArtifactChildNodeProvider';
import { InstallExtensionTreeNode } from '../InstallExtensionTreeNode';
import { getArtifactExtensionId } from '../../../metadata/fabricItemUtilities';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';

/**
 * Provides an InstallExtensionTreeNode child when the artifact's extension is not installed.
 */
export class MissingExtensionChildNodeProvider implements IArtifactChildNodeProvider {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly extensionManager: IFabricExtensionManagerInternal
    ) {}

    canProvideChildren(artifact: IArtifact): boolean {
        // Check if the artifact has an associated extension
        return !!(getArtifactExtensionId(artifact));
    }

    async getChildNodes(artifact: IArtifact): Promise<FabricTreeNode[]> {
        // Additional check to ensure the extension is indeed missing
        const extensionId = getArtifactExtensionId(artifact);
        if (!extensionId) {
            // No associated extension
            return [];
        }

        // If the extension is disabled or not installed, provide the InstallExtensionTreeNode
        if (!this.extensionManager.isAvailable(extensionId)) {
            return [new InstallExtensionTreeNode(this.context, extensionId)];
        }

        // If the extension is installed and active, no children to provide
        // The extension must register its own provider to show additional nodes
        if (this.extensionManager.isActive(extensionId)) {
            return [];
        }

        await this.extensionManager.activateExtension(extensionId);

        // After activation, if the extension is now active, no children to provide
        if (this.extensionManager.isActive(extensionId)) {
            // Extension is now active, however, tree view provider may refresh view asynchronously (addExtension method triggers a refresh)
            // Therefore, it might to lead to a confusing user experience:
            // The tree item will collapse again after the user tried to expand it to see the new nodes provided by the now-active extension
            return [];
        }

        // Still not active, provide the InstallExtensionTreeNode
        return [new InstallExtensionTreeNode(this.context, extensionId)];
    }
}
