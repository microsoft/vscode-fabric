// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricTreeNode, ArtifactTreeNode, IArtifact, IFabricTreeNodeProvider, RuntimeAttribute, InputTypeAttribute, RuntimeType, InputType } from '@microsoft/vscode-fabric-api';
import * as vscode from 'vscode';

export const allChildNodes: Map<string, number> = new Map<string, number>();

export class MockHierarchicalArtifact implements IArtifact {
    public children: MockHierarchicalArtifactChild[] = [];
    public workspaceId: string;
    public attributes: { runtime?: RuntimeAttribute; inputType?: InputTypeAttribute; };

    constructor(public id: string, public type: string, public displayName: string, public description: string | undefined, private depth: number, public fabricEnvironment: string) {
        this.workspaceId = 'unusedinmock';
        for (let i = 1; i <= depth; i++) {
            this.children.push(new MockHierarchicalArtifactChild(`${displayName}_${i}`, i - 1));
        }
        this.attributes = { runtime: RuntimeType.DotNet, inputType: InputType.Http };
    }
}

export class MockHierarchicalArtifactChild {
    public children: MockHierarchicalArtifactChild[] = [];

    constructor(public displayName: string, private depth: number) {
        for (let i = 1; i <= depth; i++) {
            this.children.push(new MockHierarchicalArtifactChild(`${displayName}_${i}`, i - 1));
        }
    }
}

export class MockHierarchicalTreeNodeProvider implements IFabricTreeNodeProvider {
    public static callCounter: Map<string, number> = new Map<string, number>();

    public readonly artifactType: string = 'MockHierarchicalItem';

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        addCallCount(MockHierarchicalTreeNodeProvider.callCounter, 'createArtifactTreeNode');
        return new MockHierarchicalArtifactTreeNode(artifact);
    }
}

class MockHierarchicalArtifactTreeNode extends ArtifactTreeNode {
    private children: MockHierarchicalArtifactChildTreeNode[] = [];

    constructor(artifact: IArtifact) {
        super(null!, artifact);

        const mockArtifact: MockHierarchicalArtifact = artifact as MockHierarchicalArtifact;
        if (mockArtifact) {
            if (mockArtifact.children.length > 0) {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
            for (let child of mockArtifact.children) {
                this.children.push(new MockHierarchicalArtifactChildTreeNode(child));
            }
        }
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        addNodes(allChildNodes, this.children);
        return this.children;
    }
}

class MockHierarchicalArtifactChildTreeNode extends FabricTreeNode {
    private children: MockHierarchicalArtifactChildTreeNode[] = [];

    constructor(private artifactChild: MockHierarchicalArtifactChild) {
        super(null!, artifactChild.displayName,
            artifactChild.children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        for (let child of this.artifactChild.children) {
            this.children.push(new MockHierarchicalArtifactChildTreeNode(child));
        }
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        addNodes(allChildNodes, this.children);
        return this.children;
    }
}

function addCallCount(counter: Map<string, number>, functionName: string) {
    if (!counter.has(functionName)) {
        counter.set(functionName, 0);
    }
    counter.set(functionName, counter.get(functionName)! + 1);
}

function addNodes(nodes: Map<string, number>, nodesToAdd: MockHierarchicalArtifactChildTreeNode[]) {
    for (let node of nodesToAdd) {
        const nodeLabel = node.label!.toString();
        if (!nodes.has(nodeLabel)) {
            nodes.set(nodeLabel, 0);
        }
        nodes.set(nodeLabel, nodes.get(nodeLabel)! + 1);
    }
}
