import * as Mocha from 'mocha';
import * as assert from 'assert';
import { Uri, ExtensionContext } from 'vscode';
import { LocalProjectTreeDataProvider } from '../../../localProject/LocalProjectTreeDataProvider';
import * as fabricExt  from '@fabric/vscode-fabric-api';
import { ILocalProjectInformation, ILocalProjectDiscovery } from '../../../localProject/definitions';
import { satelliteExtensionIds, TestExtension } from '../shared/TestExtension';
import * as os from 'os';
import * as path from 'path';
import { IObservableArray } from '../../../collections/definitions';
import { ObservableSet } from '../../../collections/ObservableSet';
import { MockFabricExtensionManager } from '../../../extensionManager/MockFabricExtensionManager';
import { MockConsoleLogger } from '@fabric/vscode-fabric-util';
import { Mock } from 'moq.ts';


interface ILocalProjectInformationTesting extends ILocalProjectInformation {
    displayName: string;
}

interface ILocalProjectDiscoveryTesting extends ILocalProjectDiscovery {
    projects: IObservableArray<ILocalProjectInformationTesting>;
}

function validateNode(actual: fabricExt.FabricTreeNode, expected: ILocalProjectInformationTesting, message: string = '') {
    const addendum: string = message ? `: ${message}` : '';
    assert.equal(actual.label, expected.displayName, `label mismatch${addendum}`);
    assert.equal(actual.tooltip, expected.path.fsPath, `tooltip mismatch${addendum}`);
}

describe('LocalProjectTreeDataProvider unit tests', () => {
    const logger = new MockConsoleLogger('FabricTests');
    const mockContext = new Mock<ExtensionContext>();

    before(() => {
        mockContext.setup((x) => x.subscriptions).returns([]);
    });

    it('Rootnode is empty by default', async () => {
        const discovery: ILocalProjectDiscovery = {
            projects: new ObservableSet<ILocalProjectInformationTesting>(),
        };
        const manager = MockFabricExtensionManager.create(satelliteExtensionIds);

        const provider = new LocalProjectTreeDataProvider(mockContext.object(), discovery, manager, logger, null);
        const result = await provider.getChildren(undefined);
        assert.equal(result.length, 0, 'Expected empty array');
    });

    it('Discover matching extensions', async () => {
        const projects: ILocalProjectInformationTesting[] = [
            { artifactType: 'type2', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'item1.type2')), displayName: 'item1' },
            { artifactType: 'type1', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'Item2.Type1')), displayName: 'Item2'  },
            { artifactType: 'type2', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'Artifact3.type2')), displayName: 'Artifact3' },
        ];
        const discovery: ILocalProjectDiscoveryTesting = {
            projects: new ObservableSet<ILocalProjectInformationTesting>(projects),
        };

        const manager = MockFabricExtensionManager.create(satelliteExtensionIds);
        manager.addExtension(TestExtension.create(satelliteExtensionIds[0], [ 'type1' ], true));
        manager.addExtension(TestExtension.create(satelliteExtensionIds[1], [ 'type2' ], true));
        manager.addExtension(TestExtension.create(satelliteExtensionIds[2], [ 'type3' ], true));

        const provider = new LocalProjectTreeDataProvider(mockContext.object(), discovery, manager, logger, null);
        const nodes = await provider.getChildren(undefined);

        assert.equal(nodes.length, 2, 'top-level nodes count');
        assert.equal(nodes[0].label, 'type1', 'top-level node label');
        assert.equal(nodes[1].label, 'type2', 'top-level node label');

        let childNodes = await provider.getChildren(nodes[0]);
        assert.equal(childNodes.length, 1, 'child nodes count');
        validateNode(childNodes[0], discovery.projects.items[1]);
        
        childNodes = await provider.getChildren(nodes[1]);
        assert.equal(childNodes.length, 2, 'child nodescount ');
        validateNode(childNodes[0], discovery.projects.items[2]);
        validateNode(childNodes[1], discovery.projects.items[0]);
    });

    it('Ignore non-matching extension', async () => {
        const projects: ILocalProjectInformationTesting[] = [
            { artifactType: 'type2', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'item1.type2')), displayName: 'item1' },
        ];
        const discovery: ILocalProjectDiscoveryTesting = {
            projects: new ObservableSet<ILocalProjectInformationTesting>(projects),
        };

        const manager = MockFabricExtensionManager.create(satelliteExtensionIds);
        manager.addExtension(TestExtension.create(satelliteExtensionIds[0], [ 'type1' ], true));

        const provider = new LocalProjectTreeDataProvider(mockContext.object(), discovery, manager, logger, null);
        const nodes = await provider.getChildren(undefined);

        assert.equal(nodes.length, 0, 'top-level nodes');
    });

    it('Respond to refresh', async () => {
        const node1: ILocalProjectInformationTesting = { artifactType: 'type1', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'Item1.Type1')), displayName: 'Item1' };
        const discovery: ILocalProjectDiscoveryTesting = {
            projects: new ObservableSet<ILocalProjectInformationTesting>([node1]),
        };

        const manager = MockFabricExtensionManager.create(satelliteExtensionIds);
        manager.addExtension(TestExtension.create(satelliteExtensionIds[0], [ 'type1' ], true));

        const provider = new LocalProjectTreeDataProvider(mockContext.object(), discovery, manager, logger, null);

        let nodes = await provider.getChildren(undefined);
        assert.equal(nodes.length, 1, 'top-level nodes count (initial)');
        let childNodes = await provider.getChildren(nodes[0]);
        assert.equal(childNodes.length, 1, 'child nodes count (initial)');
        validateNode(childNodes[0], node1);

        // Add another child
        const node2: ILocalProjectInformationTesting = { artifactType: 'type1', path: Uri.file(path.join(os.homedir(), 'Workspaces', 'Item2.Type1')), displayName: 'Item2' };
        discovery.projects.add(node2);
        nodes = await provider.getChildren(undefined);
        assert.equal(nodes.length, 1, 'top-level nodes count: Item2 added');
        childNodes = await provider.getChildren(nodes[0]);
        assert.equal(childNodes.length, 2, 'child nodes count : Item2 added');
        validateNode(childNodes[0], node1, 'Item2 added');
        validateNode(childNodes[1], node2), 'Item2 added';

        // Remove the first (there should be 1 remaining)
        discovery.projects.remove(node1);
        nodes = await provider.getChildren(undefined);
        assert.equal(nodes.length, 1, 'top-level nodes count : Item1 removed');
        childNodes = await provider.getChildren(nodes[0]);
        assert.equal(childNodes.length, 1, 'child nodes count: Item1 removed');
        validateNode(childNodes[0], node2, 'Item1 removed');

        // Remove the second (there should be 0 remaining)
        discovery.projects.remove(node2);
        nodes = await provider.getChildren(undefined);
        assert.equal(nodes.length, 0, 'top-level nodes count : Item2 removed');

    });
});
