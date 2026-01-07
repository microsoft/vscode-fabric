// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ILocalProjectTreeNodeProvider, LocalProjectTreeNode } from '@microsoft/vscode-fabric-api';
import { tryParseLocalProjectData } from './fabricUtilities';

/**
 * A default implementation for the ILocalProjectTreeNodeProvider
 */
export class LocalProjectTreeNodeProvider implements ILocalProjectTreeNodeProvider {
    /**
     * Creates a new instance of the LocalProjectTreeNodeProvider class
     * @param artifactType The type of artifact this class provides
     */
    public constructor(protected context: vscode.ExtensionContext, public artifactType: string) {
    }

    /**
     * Creates a default tree node for the specified path.
     * Creates the display name of the LocalProjectTreeNode based on the .platform file or folder name
     * @param localPath - The candidate path for a local project corresponding to the artifact type of this provider
     * @returns - A customized (@link LocalProjectTreeNode}. Returns undefined if the path is not a valid local project
     */
    async createLocalProjectTreeNode(localPath: vscode.Uri): Promise<LocalProjectTreeNode | undefined> {
        const localProjectData = await tryParseLocalProjectData(localPath);
        if (localProjectData?.type === this.artifactType) {
            return new LocalProjectTreeNode(this.context, localProjectData.displayName, localPath);
        }

        return undefined;
    }
}
