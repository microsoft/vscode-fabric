// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricTreeNode, IArtifact } from '@microsoft/vscode-fabric-api';

/**
 * Interface for providers that can contribute child nodes to an artifact tree node.
 * Multiple providers can be composed together to build up the full set of children.
 */
export interface IArtifactChildNodeProvider {
    /**
     * Gets child nodes for the given artifact.
     * @param artifact The artifact to get children for
     * @returns Array of child nodes, or empty array if this provider has no children for this artifact
     */
    getChildNodes(artifact: IArtifact): Promise<FabricTreeNode[]>;

    /**
     * Determines if this provider can provide children for the given artifact.
     * This allows providers to opt-in/out based on artifact type, configuration, etc.
     * @param artifact The artifact to check
     * @returns true if this provider can provide children, false otherwise
     */
    canProvideChildren(artifact: IArtifact): boolean;
}
