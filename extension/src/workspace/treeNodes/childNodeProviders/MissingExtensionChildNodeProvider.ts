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
        const extensionId = getArtifactExtensionId(artifact);
        return !!(extensionId && !this.extensionManager.isAvailable(extensionId));
    }

    async getChildNodes(artifact: IArtifact): Promise<FabricTreeNode[]> {
        const extensionId = getArtifactExtensionId(artifact);
        if (!extensionId) {
            return [];
        }

        return [new InstallExtensionTreeNode(this.context, extensionId)];
    }
}
