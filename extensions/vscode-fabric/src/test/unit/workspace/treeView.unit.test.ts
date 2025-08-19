import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { RootTreeNodeProvider, TreeViewWorkspaceTreeNode, ListViewWorkspaceTreeNode, IRootTreeNodeProvider } from '../../../workspace/treeView';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { ArtifactTreeNode, FabricTreeNode, IArtifact, IFabricTreeNodeProvider, IWorkspaceManager, IWorkspace } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ObservableMap } from '../../../collections/ObservableMap';

async function createInstance(storage: IFabricExtensionsSettingStorage, context: vscode.ExtensionContext, extensionManager: IFabricExtensionManagerInternal, workspaceManager: IWorkspaceManager, telemetryService: TelemetryService | null): Promise<IRootTreeNodeProvider> {
    const instance = new RootTreeNodeProvider(storage, context, extensionManager, workspaceManager, telemetryService);
    await instance.enableCommands();
    return instance;
}

describe('RootTreeNodeProvider', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let workspaceMock: Mock<IWorkspace>;
    let settingsMock: Mock<IFabricExtensionSettings>;
    let contextMock: Mock<vscode.ExtensionContext>;

    beforeEach(() => {
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        workspaceMock = new Mock<IWorkspace>();
        settingsMock = new Mock<IFabricExtensionSettings>();
        contextMock = new Mock<vscode.ExtensionContext>();

        // Set up mocks to perform common operations
        telemetryServiceMock.setup(instance => instance.sendTelemetryEvent(It.IsAny(), It.IsAny())).returns(undefined);
        workspaceManagerMock.setup(instance => instance.fabricWorkspaceContext).returns('fabricWorkspaceContext');
    });

    it('ListView Tree: Empty', async () => {
        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([]));

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof ListViewWorkspaceTreeNode);

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 0, 'Child nodes should be empty for ListView style');
        workspaceManagerMock.verify(instance => instance.getItemsInWorkspace(), Times.Once());
        workspaceManagerMock.verify(instance => instance.fabricWorkspaceContext, Times.Once());
    });

    it('TreeView Tree: Empty', async () => {
        settingsMock.setup(instance => instance.displayStyle).returns('TreeView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([]));

        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');
        assert(rootNode instanceof TreeViewWorkspaceTreeNode);

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 0, 'Child nodes should be empty for ListView style');
        workspaceManagerMock.verify(instance => instance.getItemsInWorkspace(), Times.Once());
        workspaceManagerMock.verify(instance => instance.fabricWorkspaceContext, Times.Once());
    });

    it('ListView Tree: Child items, no providers', async () => {
        const item2B: IArtifact = createArtifact('Type2','ItemB');
        const item2A: IArtifact = createArtifact('Type2','ItemA');
        const item1C: IArtifact = createArtifact('Type1','ItemC');

        settingsMock.setup(instance => instance.displayStyle).returns('ListView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([ item2B, item2A, item1C ]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(new ObservableMap<string, IFabricTreeNodeProvider>());
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');

        const childNodes = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 3, 'Child nodes length');
        workspaceManagerMock.verify(instance => instance.getItemsInWorkspace(), Times.Once());

        // Make sure we have the correct items and they are sorted
        const expectedNodeOrder = [ item2A, item2B, item1C ];
        for (let i = 0; i < expectedNodeOrder.length; i++) {
            assert.equal(childNodes[i].label, expectedNodeOrder[i].displayName, `Child node ${i} label`);
        }
    });

    it('TreeView Tree: Child items, no providers', async () => {
        const item2B: IArtifact = createArtifact('Type2','ItemB');
        const item2A: IArtifact = createArtifact('Type2','ItemA');
        const item1C: IArtifact = createArtifact('Type1','ItemC');

        settingsMock.setup(instance => instance.displayStyle).returns('TreeView');
        storageMock.setup(instance => instance.settings).returns(settingsMock.object());
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([ item2B, item2A, item1C ]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(new ObservableMap<string, IFabricTreeNodeProvider>());
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();
        assert.notEqual(childNodes, undefined, 'Child nodes should not be undefined');
        assert.equal(childNodes.length, 2, 'Child nodes length');
        workspaceManagerMock.verify(instance => instance.getItemsInWorkspace(), Times.Once());

        // Make sure we have the correct items and they are sorted
        const expectedNodeOrder = [ [item1C], [item2A, item2B] ];
        for (let i = 0; i < expectedNodeOrder.length; i++) {
            const artifactNodes: FabricTreeNode[] = await childNodes[i].getChildNodes();
            assert.equal(artifactNodes.length, expectedNodeOrder[i].length, `Child node ${i} length`);
            assert.equal(childNodes[i].label, expectedNodeOrder[i][0].type, `Child node ${i} label`);
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
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([ item2B, item2A, item1C ]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(treeNodeProviders);
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();

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
        workspaceManagerMock.setup(instance => instance.getItemsInWorkspace()).returns(Promise.resolve([ item2B, item2A, item1C ]));
        extensionManagerMock.setup(instance => instance.treeNodeProviders).returns(treeNodeProviders);
        const provider = await createInstance(storageMock.object(), contextMock.object(), extensionManagerMock.object(), workspaceManagerMock.object(), telemetryServiceMock.object());

        const rootNode = provider.create(workspaceMock.object());
        assert.notEqual(rootNode, undefined, 'Root node should not be undefined');

        const childNodes: FabricTreeNode[] = await rootNode.getChildNodes();

        // Make sure the child nodes have a chance to be created
        const expectedNodeOrder = [ [item1C], [item2A, item2B] ];
        for (let i = 0; i < expectedNodeOrder.length; i++) {
            await childNodes[i].getChildNodes();
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