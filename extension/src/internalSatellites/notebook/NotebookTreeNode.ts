// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode } from '@microsoft/vscode-fabric-api';

export class NotebookTreeNode extends ArtifactTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);
        this.contextValue += '|item-open-in-notebook';
    }
}
