import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, It } from 'moq.ts';

import { showWorkspaceQuickPick } from '../../../ui/showWorkspaceQuickPick';
import { IWorkspaceManager, IWorkspace } from '@microsoft/vscode-fabric-api';
import { ICapacityManager } from '../../../CapacityManager';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { NotSignedInError } from '../../../ui/NotSignedInError';
import * as showCreateWorkspaceWizardModule from '../../../ui/showCreateWorkspaceWizard';

describe('showWorkspaceQuickPick', () => {
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;

    let showQuickPickStub: sinon.SinonStub;
    let showCreateWorkspaceWizardStub: sinon.SinonStub;

    const personalWorkspace: IWorkspace = {
        objectId: 'ws-personal',
        displayName: 'Personal Workspace',
        description: 'Personal',
        type: 'Personal'
    };
    const otherWorkspace: IWorkspace = {
        objectId: 'ws-other',
        displayName: 'Other Workspace',
        description: 'Other',
        type: 'Workspace'
    };
    const createWorkspace: IWorkspace = {
        objectId: 'ws-create',
        displayName: 'Create New Workspace',
        description: 'Create a new workspace',
        type: 'Personal'
    };

    beforeEach(() => {
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        capacityManagerMock = new Mock<ICapacityManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();

        workspaceManagerMock.setup(m => m.isConnected()).returnsAsync(true);

        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
        showCreateWorkspaceWizardStub = sinon.stub(showCreateWorkspaceWizardModule, 'showCreateWorkspaceWizard');
        showCreateWorkspaceWizardStub.resolves(createWorkspace);

    });

    afterEach(() => {
        sinon.restore();
    });

    it('Workspaces are sorted alphabetically by type', async () => {
        const ws1: IWorkspace = { objectId: 'ws-1', displayName: 'Delta', description: '', type: 'Personal' };
        const ws2: IWorkspace = { objectId: 'ws-2', displayName: 'Charlie', description: '', type: 'Workspace' };
        const ws3: IWorkspace = { objectId: 'ws-3', displayName: 'Bravo', description: '', type: 'Personal' };
        const ws4: IWorkspace = { objectId: 'ws-4', displayName: 'Alpha', description: '', type: 'Workspace' };
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([ws1, ws2, ws3, ws4]);
        let receivedItems: string[] = [];
        showQuickPickStub.callsFake((items: string[]) => {
            receivedItems = items;
            return Promise.resolve(undefined);
        });

        // Act
        await act();

        // Assert
        // The first item is always "Create new...", so skip it for sorting check
        const workspaceNames = receivedItems.slice(1);
        const expectedOrder = [ws3, ws1, ws4, ws2].map(ws => ws.displayName);
        assert.deepStrictEqual(workspaceNames, expectedOrder, 'Workspaces should be sorted alphabetically by type');
    });

    it('User selects existing workspace', async () => {
        // Arrange
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([personalWorkspace, otherWorkspace]);

        // The quick pick items are: [create, personal, other]
        showQuickPickStub.callsFake((items: string[]) => {
            // Select the other workspace
            return Promise.resolve(items.find(i => i.includes(otherWorkspace.displayName)));
        });

        // Act
        const result = await act();

        // Assert
        assert.ok(result);
        assert.deepStrictEqual(result, otherWorkspace);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showCreateWorkspaceWizardStub.notCalled, 'showCreateWorkspaceWizard should not be called');
    });

    it('User selects "Create new..."', async () => {
        // Arrange
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([personalWorkspace, otherWorkspace]);

        showQuickPickStub.callsFake((items: string[]) => {
            return Promise.resolve(items[0]);
        });

        // Act
        const result = await act();

        // Assert
        assert.ok(result);
        assert.deepStrictEqual(result, createWorkspace);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showCreateWorkspaceWizardStub.calledOnce, 'showCreateWorkspaceWizard should be called');
    });

    it('User cancels "Create new..."', async () => {
        // Arrange
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([personalWorkspace, otherWorkspace]);

        showQuickPickStub.callsFake((items: string[]) => {
            return Promise.resolve(items[0]);
        });
        showCreateWorkspaceWizardStub.resolves(undefined); // Simulate user canceling the create wizard

        // Act
        const workspace = await act();

        // Assert
        assert.strictEqual(workspace, undefined, 'Workspace should not be created when user cancels input');
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showCreateWorkspaceWizardStub.calledOnce, 'showCreateWorkspaceWizard should be called');
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

    async function act(): Promise<IWorkspace | undefined> {
        return await showWorkspaceQuickPick(
            workspaceManagerMock.object(),
            capacityManagerMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object()
        );
    }
});