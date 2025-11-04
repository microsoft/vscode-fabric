// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { RootTreeNodeProvider } from '../../../src/workspace/treeView';
import { IRootTreeNodeProvider } from '../../../src/workspace/definitions';
import { TenantTreeNode } from '../../../src/workspace/treeNodes/TenantTreeNode';
import { ListViewWorkspaceTreeNode } from '../../../src/workspace/treeNodes/ListViewWorkspaceTreeNode';
import { TreeViewWorkspaceTreeNode } from '../../../src/workspace/treeNodes/TreeViewWorkspaceTreeNode';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage } from '../../../src/settings/definitions';
import { IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import {
    ArtifactTreeNode,
    FabricTreeNode,
    IArtifact,
    IFabricTreeNodeProvider,
    IWorkspaceManager,
    IWorkspace,
    IWorkspaceFolder,
} from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ITenantSettings, IAccountProvider } from '../../../src/authentication';
import { ObservableMap } from '../../../src/collections/ObservableMap';

async function createInstance(
    storage: IFabricExtensionsSettingStorage,
    context: vscode.ExtensionContext,
    extensionManager: IFabricExtensionManagerInternal,
    workspaceManager: IWorkspaceManager,
    accountProvider: IAccountProvider,
    telemetryService: TelemetryService | null
): Promise<IRootTreeNodeProvider> {
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
        workspaceManagerMock.setup(instance => instance.getFoldersInWorkspace(It.IsAny())).returns(Promise.resolve([]));
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

        const workspaceNode = childNodes[0] as ListViewWorkspaceTreeNode;
        await workspaceNode.getChildNodes();

        workspaceManagerMock.verify(instance => instance.getFoldersInWorkspace(It.IsAny()), Times.Once());
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
        workspaceManagerMock.verify(instance => instance.getFoldersInWorkspace(It.IsAny()), Times.Once());
    });

    it('ListView Tree: Groups artifacts by folders', async () => {
        const salesFolder = createFolder('folder-sales', 'Sales');
        const q1Folder = createFolder('folder-q1', 'Q1', salesFolder.id);
        workspaceManagerMock.setup(instance => instance.getFoldersInWorkspace(It.IsAny())).returns(Promise.resolve([salesFolder, q1Folder]));

        const rootArtifact: IArtifact = createArtifact('TypeRoot', 'Root Item');
        const salesArtifact: IArtifact = createArtifact('TypeSales', 'Sales Item', salesFolder.id);
        const q1Artifact: IArtifact = createArtifact('TypeQ1', 'Q1 Item', q1Folder.id);

        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([workspaceMock.object()]));
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace(It.IsAny())).returns(Promise.resolve([rootArtifact, salesArtifact, q1Artifact]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(new ObservableMap<string, IFabricTreeNodeProvider>());

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), accountProviderMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(tenantMock.object());
        const childNodes = await rootNode.getChildNodes();
        const workspaceNode = childNodes[0] as ListViewWorkspaceTreeNode;
        const topLevelNodes = await workspaceNode.getChildNodes();

        assert.equal(topLevelNodes.length, 2, 'Workspace should have one folder and one root-level artifact');
        const folderNode = topLevelNodes[0];
        assert.equal(folderNode.label, salesFolder.displayName, 'First node should be the Sales folder');
        assert.equal(folderNode.contextValue, 'WorkspaceFolderTreeNode', 'Folder node should expose folder context');
        assert.equal(folderNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed, 'Folder node should be collapsible');

        const rootNodes = topLevelNodes[1];
        assert.equal(rootNodes.label, rootArtifact.displayName, 'Second node should be the root-level artifact');

        const salesChildren = await folderNode.getChildNodes();
        assert.equal(salesChildren.length, 2, 'Sales should contain a child folder and an artifact');
        assert.equal(salesChildren[0].label, q1Folder.displayName, 'First child of Sales should be the Q1 folder');
        assert.equal(salesChildren[0].contextValue, 'WorkspaceFolderTreeNode', 'Nested folder should expose folder context');
        const q1Children = await salesChildren[0].getChildNodes();
        assert.equal(q1Children.length, 1, 'Q1 should contain one artifact');
        assert.equal(q1Children[0].label, q1Artifact.displayName, 'Q1 artifact should be under Q1 folder');

        assert.equal(salesChildren[1].label, salesArtifact.displayName, 'Sales artifact should be alongside nested folder');
        workspaceManagerMock.verify(instance => instance.getFoldersInWorkspace(It.IsAny()), Times.Once());
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

    function createArtifact(type: string, displayName: string, folderId?: string): IArtifact {
        return {
            type: type,
            displayName: displayName,
            id: `id-${type}-${displayName}`,
            workspaceId: `workspace-${type}-${displayName}`,
            description: `description-${type}-${displayName}`,
            fabricEnvironment: 'mock',
            folderId: folderId,
        };
    }

    function createFolder(id: string, displayName: string, parentFolderId?: string): IWorkspaceFolder {
        return {
            id,
            displayName,
            workspaceId: 'test-workspace-id',
            parentFolderId,
        };
    }
});
