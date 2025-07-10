import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode } from '@fabric/vscode-fabric-api';

export class NotebookTreeNode extends ArtifactTreeNode {
    constructor(context: vscode.ExtensionContext, public readonly artifact: IArtifact) {
        super(context, artifact);
        this.contextValue += '|item-open-in-notebook';
    }

    public async getExternalUri(): Promise<string> {
        const targetUrl = `${vscode.env.uriScheme}://SynapseVSCode.synapse?workspaceId=${this.artifact.workspaceId}&artifactId=${this.artifact.id}`;
        return targetUrl;
    }
}