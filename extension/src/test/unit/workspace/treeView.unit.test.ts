// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { RootTreeNodeProvider } from '../../../workspace/treeView';
import { IRootTreeNodeProvider } from '../../../workspace/definitions';
import { TenantTreeNode } from '../../../workspace/treeNodes/TenantTreeNode';
import { ListViewWorkspaceTreeNode } from '../../../workspace/treeNodes/ListViewWorkspaceTreeNode';
import { TreeViewWorkspaceTreeNode } from '../../../workspace/treeNodes/TreeViewWorkspaceTreeNode';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { ArtifactTreeNode, FabricTreeNode, IArtifact, IFabricTreeNodeProvider, IWorkspaceManager, IWorkspace } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ITenantSettings, IAccountProvider } from '../../../authentication';
import { ObservableMap } from '../../../collections/ObservableMap';

async function createInstance(storage: IFabricExtensionsSettingStorage, context: vscode.ExtensionContext, extensionManager: IFabricExtensionManagerInternal, workspaceManager: IWorkspaceManager, accountProvider: IAccountProvider, telemetryService: TelemetryService | null): Promise<IRootTreeNodeProvider> {
    const instance = new RootTreeNodeProvider(storage, context, extensionManager, workspaceManager, accountProvider, telemetryService);
    await instance.enableCommands();
    return instance;
}

describe('RootTreeNodeProvider', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let accountProviderMock: Mock<IAccountProvider>;
    let workspaceMock: Mock<IWorkspace>;
    let tenantMock: Mock<ITenantSettings>;
    let settingsMock: Mock<IFabricExtensionSettings>;
    let contextMock: Mock<vscode.ExtensionContext>;

    beforeEach(() => {
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        accountProviderMock = new Mock<IAccountProvider>();
        workspaceMock = new Mock<IWorkspace>();
        tenantMock = new Mock<ITenantSettings>();
        settingsMock = new Mock<IFabricExtensionSettings>();
        contextMock = new Mock<vscode.ExtensionContext>();

        // Set up workspace mock with objectId
        workspaceMock.setup(instance => instance.objectId).returns('test-workspace-id');

        // Set up tenant mock
        tenantMock.setup(instance => instance.tenantId).returns('test-tenant-id');
        tenantMock.setup(instance => instance.defaultDomain).returns('test-domain.com');

        // Set up mocks to perform common operations
        telemetryServiceMock.setup(instance => instance.sendTelemetryEvent(It.IsAny(), It.IsAny())).returns(undefined);
        workspaceManagerMock.setup(instance => instance.fabricWorkspaceContext).returns('fabricWorkspaceContext');
    });

    it('ListView Tree: Empty', async () => {
        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([]));

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 0, 'Child nodes should be empty when no workspaces');
    });

    it('TreeView Tree: Empty', async () => {
        settingsMock.setup(instance => instance.displayStyle).returns('TreeView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([]));

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 0, 'Child nodes should be empty when no workspaces');
    });

    it('ListView Tree: Child items, no providers', async () => {
        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([workspaceMock.object()]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(new ObservableMap<string, IFabricTreeNodeProvider>());

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 1, 'Should have one workspace child node');
        assert(childNodes[0] instanceof ListViewWorkspaceTreeNode, 'Child should be ListViewWorkspaceTreeNode');
    });

    it('TreeView Tree: Child items, no providers', async () => {
        const item2B: IArtifact = createArtifact('Type2','ItemB');
        const item2A: IArtifact = createArtifact('Type2','ItemA');
        const item1C: IArtifact = createArtifact('Type1','ItemC');

        settingsMock.setup(instance => instance.displayStyle).returns('TreeView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([workspaceMock.object()]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([item2B, item2A, item1C]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(new ObservableMap<string, IFabricTreeNodeProvider>());
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 1, 'Should have one workspace child node');
        assert(childNodes[0] instanceof TreeViewWorkspaceTreeNode, 'Child should be TreeViewWorkspaceTreeNode');

        // Get the type nodes from the workspace node
        const workspaceNode = childNodes[0] as TreeViewWorkspaceTreeNode;
        const typeNodes = await workspaceNode.getChildNodes();
        assert.equal(typeNodes.length, 2, 'Should have 2 type nodes');
        workspaceManagerMock.verify(instance => instance.getItemsInWorkspace(It.IsAny()), Times.Once());

        // Make sure we have the correct items and they are sorted
        const expectedNodeOrder = [[item1C], [item2A, item2B]];
        for (let i = 0; i < expectedNodeOrder.length; i++) {
            const artifactNodes: FabricTreeNode[] = await typeNodes[i].getChildNodes();
            assert.equal(artifactNodes.length, expectedNodeOrder[i].length, `Type node ${i} artifact count`);
            assert.equal(typeNodes[i].label, expectedNodeOrder[i][0].type, `Type node ${i} label`);
            for (let j = 0; j < artifactNodes.length; j++) {
                assert.equal(artifactNodes[j].label, expectedNodeOrder[i][j].displayName, `Artifact node ${j} label`);
            }
        }
    });

    it('ListView Tree: Child items, with providers', async () => {
        const item2B: IArtifact = createArtifact('Type2','ItemB');
        const item2A: IArtifact = createArtifact('Type2','ItemA');
        const item1C: IArtifact = createArtifact('Type1','ItemC');

        const treeNodeProviders = new ObservableMap<string, IFabricTreeNodeProvider>();
        const treeNodeProviderMock = new Mock<IFabricTreeNodeProvider>();
        treeNodeProviderMock.setup(instance => instance.createArtifactTreeNode(It.Is(artifact => artifact === item2A))).returns(Promise.resolve(new ArtifactTreeNode(contextMock.object(), item2A)));
        treeNodeProviderMock.setup(instance => instance.createArtifactTreeNode(It.Is(artifact => artifact === item2B))).returns(Promise.resolve(new ArtifactTreeNode(contextMock.object(), item2B)));

        treeNodeProviders.set('Type2', treeNodeProviderMock.object());

        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([workspaceMock.object()]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([item2B, item2A, item1C]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(treeNodeProviders);
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 1, 'Should have one workspace child node');
        assert(childNodes[0] instanceof ListViewWorkspaceTreeNode, 'Child should be ListViewWorkspaceTreeNode');

        // Get the artifacts from the workspace node to verify provider usage
        const workspaceNode = childNodes[0] as ListViewWorkspaceTreeNode;
        const artifactNodes = await workspaceNode.getChildNodes();

        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item2B), Times.Once());
        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item2A), Times.Once());
        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item1C), Times.Never());
    });

    it('TreeView Tree: Child items, with providers', async () => {
        const item2B: IArtifact = createArtifact('Type2','ItemB');
        const item2A: IArtifact = createArtifact('Type2','ItemA');
        const item1C: IArtifact = createArtifact('Type1','ItemC');

        const treeNodeProviders = new ObservableMap<string, IFabricTreeNodeProvider>();
        const treeNodeProviderMock = new Mock<IFabricTreeNodeProvider>();
        treeNodeProviderMock.setup(instance => instance.createArtifactTreeNode(It.Is(artifact => artifact === item2A))).returns(Promise.resolve(new ArtifactTreeNode(contextMock.object(), item2A)));
        treeNodeProviderMock.setup(instance => instance.createArtifactTreeNode(It.Is(artifact => artifact === item2B))).returns(Promise.resolve(new ArtifactTreeNode(contextMock.object(), item2B)));

        treeNodeProviders.set('Type2', treeNodeProviderMock.object());

        settingsMock.setup(instance => instance.displayStyle).returns('TreeView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([workspaceMock.object()]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([item2B, item2A, item1C]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(treeNodeProviders);
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TenantTreeNode);

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 1, 'Should have one workspace child node');
        assert(childNodes[0] instanceof TreeViewWorkspaceTreeNode, 'Child should be TreeViewWorkspaceTreeNode');

        // Get the type nodes from the workspace node
        const workspaceNode = childNodes[0] as TreeViewWorkspaceTreeNode;
        const typeNodes = await workspaceNode.getChildNodes();

        // Make sure the type nodes have a chance to be created
        const expectedNodeOrder = [[item1C], [item2A, item2B]];
        for (let i = 0; i < expectedNodeOrder.length; i++) {
            await typeNodes[i].getChildNodes();
        }

        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item2B), Times.Once());
        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item2A), Times.Once());
        treeNodeProviderMock.verify(instance => instance.createArtifactTreeNode(item1C), Times.Never());
    });

    function createArtifact(type: string, displayName: string): IArtifact {
        return {
            type: type,
            displayName: displayName,
            id: `id-${type}-${displayName}`,
            workspaceId: `workspace-${type}-${displayName}`,
            description: `description-${type}-${displayName}`,
            fabricEnvironment: 'mock',
        };
    }
});
