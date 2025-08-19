import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';

import { showCreateWorkspaceWizard } from '../../../ui/showCreateWorkspaceWizard';
import { IWorkspaceManager, IFabricApiClient, IApiClientResponse, IWorkspace } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { NotSignedInError } from '../../../ui/NotSignedInError';
import { ICapacity, ICapacityManager, CapacityState } from '../../../CapacityManager';

describe('showCreateWorkspaceWizard', () => {
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;

    let showInputBoxStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    let capturedTelemetryProps: any = undefined;

    const baseCapacity: ICapacity= { 
        displayName: 'test capacity - display name', 
        id: 'test capacity - id',
        state: 'Active',
        region: 'test capacity - region',
        sku: 'test capacity - sku',
    };
    const expectedWorkspace: IWorkspace = {
        objectId: 'test workspace - id',
        capacityId: baseCapacity.id,
        displayName: 'test workspace - display name',
        description: 'test workspace - description',
        type: 'Workspace',
    };

    beforeEach(() => {
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        capacityManagerMock = new Mock<ICapacityManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        capturedTelemetryProps = undefined;

        workspaceManagerMock.setup(m => m.isConnected()).returnsAsync(true);
        workspaceManagerMock.setup(m => m.createWorkspace(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({
                status: 201,
                parsedBody: {
                    id: expectedWorkspace.objectId,
                    displayName: expectedWorkspace.displayName,
                    description: expectedWorkspace.description,
                    type: expectedWorkspace.type,
                    capacityId: expectedWorkspace.capacityId,
                }
            }));

        telemetryServiceMock.setup(x =>
            x.sendTelemetryEvent(
                It.IsAny(),
                It.Is<any>(props => {
                    capturedTelemetryProps = props;
                    return true;
                }),
                It.IsAny()
            )
        ).returns(undefined);

        capacityManagerMock.setup(m => m.listCapacities())
            .returns(Promise.resolve([baseCapacity]));

        loggerMock.setup(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns();
        loggerMock.setup(l => l.log(It.IsAny(), It.IsAny(), It.IsAny()))
            .returns();

        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');

        showInputBoxStub.resolves(expectedWorkspace.displayName);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Success, single capacity', async () => {
        // Arrange

        // Act
        const workspace = await act();

        // Assert
        assert.ok(workspace, 'Workspace should be created');

        assert(showQuickPickStub.notCalled, 'Capacity picker should not be shown');

        assert.strictEqual(workspace.displayName, expectedWorkspace.displayName, 'Workspace name should match');
        assert.strictEqual(workspace.capacityId, expectedWorkspace.capacityId, 'Workspace capacity ID should match');
        assert.strictEqual(workspace.objectId, expectedWorkspace.objectId, 'Workspace ID should match');
        assert.strictEqual(workspace.description, expectedWorkspace.description, 'Workspace description should match');
        assert.strictEqual(workspace.type, expectedWorkspace.type, 'Workspace type should match');

        assert(showInputBoxStub.calledOnce, 'Input box for workspace name should be shown');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].value, '', 'Input box should have correct default value');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].prompt, 'Name', 'Input box should have correct prompt');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].title, 'Create a workspace', 'Input box should have correct title');

        // Verify telemetry
        telemetryServiceMock.verify(
            x => x.sendTelemetryEvent('workspace/create', It.IsAny(), It.IsAny()),
            Times.Once()
        );
        assert.ok(capturedTelemetryProps, 'Telemetry should have been captured');
        assert.strictEqual(capturedTelemetryProps.statusCode, '201', 'statusCode');
        assert.strictEqual(capturedTelemetryProps.workspaceId, expectedWorkspace.objectId, 'workspaceId');
        assert.strictEqual(capturedTelemetryProps.fabricWorkspaceName, expectedWorkspace.displayName, 'fabricWorkspaceName');
    });
    
    it('Success, no capacities', async () => {
        // Arrange
        capacityManagerMock.setup(m => m.listCapacities()).returns(Promise.resolve([]));

        // Act
        const workspace = await act();

        // Assert
        assert.ok(workspace, 'Workspace should be created');

        assert(showQuickPickStub.notCalled, 'Capacity picker should not be shown');

        assert.strictEqual(workspace.displayName, expectedWorkspace.displayName, 'Workspace name should match');
        assert.strictEqual(workspace.capacityId, expectedWorkspace.capacityId, 'Workspace capacity ID should match');
        assert.strictEqual(workspace.objectId, expectedWorkspace.objectId, 'Workspace ID should match');
        assert.strictEqual(workspace.description, expectedWorkspace.description, 'Workspace description should match');
        assert.strictEqual(workspace.type, expectedWorkspace.type, 'Workspace type should match');

        assert(showInputBoxStub.calledOnce, 'Input box for workspace name should be shown');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].value, '', 'Input box should have correct default value');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].prompt, 'Name', 'Input box should have correct prompt');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].title, 'Create a workspace', 'Input box should have correct title');
    });

    it('Success, multiple capacities', async () => {
        // Arrange
        const capacities: ICapacity[] = [
            createCapacity('capacityB'),
            baseCapacity,
            createCapacity('capacityC'),
        ];

        capacityManagerMock.setup(m => m.listCapacities()).returns(Promise.resolve(capacities));

        let receivedItems: any[] = [];
        showQuickPickStub.callsFake((items: any[]) => {
            receivedItems = items;
            // Find the item with label matching base capacity display name and return that
            const selectedItem = items.find(item => item.label === baseCapacity.displayName);
            assert.ok(selectedItem, 'Capacity picker should have the expected item');
            return Promise.resolve(selectedItem);
        });

        // Act
        const workspace = await act();

        // Assert
        assert.ok(workspace, 'Workspace should be created');

        assert(showQuickPickStub.calledOnce, 'Capacity picker should be shown');
        assert.strictEqual(showQuickPickStub.firstCall.args[1].title, 'Choose Capacity...', 'Capacity picker should have correct title');

        assert.strictEqual(workspace.displayName, expectedWorkspace.displayName, 'Workspace name should match');
        assert.strictEqual(workspace.capacityId, expectedWorkspace.capacityId, 'Workspace capacity ID should match');
        assert.strictEqual(workspace.objectId, expectedWorkspace.objectId, 'Workspace ID should match');
        assert.strictEqual(workspace.description, expectedWorkspace.description, 'Workspace description should match');
        assert.strictEqual(workspace.type, expectedWorkspace.type, 'Workspace type should match');

        assert(showInputBoxStub.calledOnce, 'Input box for workspace name should be shown');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].value, '', 'Input box should have correct default value');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].prompt, 'Name', 'Input box should have correct prompt');
        assert.strictEqual(showInputBoxStub.firstCall.args[0].title, 'Create a workspace', 'Input box should have correct title');
    });

    it('Capacity picker is sorted with only active capacities', async () => {
        // Arrange
        const capacities: ICapacity[] = [
            createCapacity('capacityC'),
            createCapacity('capacityB', 'Inactive'), // This capacity should be filtered out
            createCapacity('capacityA'),
        ];

        capacityManagerMock.setup(m => m.listCapacities()).returns(Promise.resolve(capacities));

        let receivedItems: any[] = [];
        showQuickPickStub.callsFake((items: any[]) => {
            receivedItems = items;
            return Promise.resolve(items[0]);
        });

        // Act
        const workspace = await act();

        // Assert
        const displayNames = receivedItems.map(i => i.label || i.displayName);
        const sorted = [...displayNames].sort((a, b) => a.localeCompare(b));
        assert.deepStrictEqual(displayNames, sorted, 'Items should be alphabetized by displayName');
        assert.strictEqual(receivedItems.length, 2, 'Only active capacities should be shown in the picker');
        assert.strictEqual(receivedItems[0].label, 'capacityA - display name', 'First item should be capacityA');
        assert.strictEqual(receivedItems[1].label, 'capacityC - display name', 'Second item should be capacityC');
    });

    it('Cancel: display name', async () => {
        // Arrange
        showInputBoxStub.resolves(undefined);

        // Act
        const workspace = await act();

        // Assert
        assert.strictEqual(workspace, undefined, 'Workspace should not be created when user cancels input');
        assert(showInputBoxStub.calledOnce, 'Input box for workspace name should be shown');
    });

    it('Cancel: capacity selection', async () => {
        // Arrange
        const capacities: ICapacity[] = [
            createCapacity('capacityC'),
            createCapacity('capacityB', 'Inactive'), // This capacity should be filtered out
            createCapacity('capacityA'),
        ];

        capacityManagerMock.setup(m => m.listCapacities()).returns(Promise.resolve(capacities));

        showQuickPickStub.resolves(undefined);

        // Act
        const workspace = await act();

        // Assert
        assert.strictEqual(workspace, undefined, 'Workspace should not be created when user cancels input');
        assert(showInputBoxStub.calledOnce, 'Input box for workspace name should be shown');
    });

    it('Error: User is not signed in', async () => {
        // Arrange
        workspaceManagerMock.setup(m => m.isConnected()).returnsAsync(false);

        // Act & Assert
        await assert.rejects(
            async () => {
                await act();
            },
            (err: Error) => err instanceof NotSignedInError
        );
    });

    it('Error: API error', async () => {
        // Arrange
        const apiClientResponseMock = new Mock<IApiClientResponse>();
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);

        workspaceManagerMock.setup(m => m.createWorkspace(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        // Act
        let error: Error | undefined = undefined;
        await assert.rejects(
            async () => {
                await act();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err;
                return true;
            } 
        );

        // Assert
        telemetryServiceMock.verify(
            x => x.sendTelemetryEvent('workspace/create', It.IsAny(), It.IsAny()),
            Times.Once()
        );
        assert.ok(capturedTelemetryProps, 'Telemetry should have been captured');
        assert.strictEqual(capturedTelemetryProps.statusCode, '400', 'statusCode');
        assert.strictEqual(capturedTelemetryProps.workspaceId, undefined, 'workspaceId should not be set');
        assert.strictEqual(capturedTelemetryProps.fabricWorkspaceName, undefined, 'fabricWorkspaceName should not be set');
    });

    async function act(): Promise<IWorkspace | undefined> {
        return showCreateWorkspaceWizard(
            workspaceManagerMock.object(),
            capacityManagerMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object(),
        );
    }

    function createCapacity(baseName: string, state: CapacityState = 'Active'): ICapacity {
        return {
            displayName: `${baseName} - display name`,
            id: `${baseName} - id`,
            state: state,
            region: `${baseName} - region`,
            sku: `${baseName} - sku`,
        };
    }
});