// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, It } from 'moq.ts';

import { showWorkspaceQuickPick } from '../../../ui/showWorkspaceQuickPick';
import { IWorkspaceManager, IWorkspace } from '@microsoft/vscode-fabric-api';
import { ICapacityManager } from '../../../CapacityManager';
import { IWorkspaceFilterManager } from '../../../workspace/WorkspaceFilterManager';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { NotSignedInError } from '../../../ui/NotSignedInError';
import * as showCreateWorkspaceWizardModule from '../../../ui/showCreateWorkspaceWizard';

describe('showWorkspaceQuickPick', () => {
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;

    let showQuickPickStub: sinon.SinonStub;
    let showCreateWorkspaceWizardStub: sinon.SinonStub;

    const personalWorkspace: IWorkspace = {
        objectId: 'ws-personal',
        displayName: 'Personal Workspace',
        description: 'Personal',
        type: 'Personal',
    };
    const otherWorkspace: IWorkspace = {
        objectId: 'ws-other',
        displayName: 'Other Workspace',
        description: 'Other',
        type: 'Workspace',
    };
    const createWorkspace: IWorkspace = {
        objectId: 'ws-create',
        displayName: 'Create New Workspace',
        description: 'Create a new workspace',
        type: 'Personal',
    };

    beforeEach(() => {
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        capacityManagerMock = new Mock<ICapacityManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();

        workspaceManagerMock.setup(m => m.isConnected()).returnsAsync(true);

        workspaceFilterManagerMock.setup(m => m.getVisibleWorkspaceIds())
            .returns([]);
        workspaceFilterManagerMock.setup(m => m.isWorkspaceVisible(It.IsAny()))
            .returns(false);

        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
        showCreateWorkspaceWizardStub = sinon.stub(showCreateWorkspaceWizardModule, 'showCreateWorkspaceWizard');
        showCreateWorkspaceWizardStub.resolves(createWorkspace);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('shows filtered and remaining workspaces in correct order', async () => {
        // Arrange
        const ws1: IWorkspace = { objectId: 'id1', displayName: 'Filtered Workspace', description: '', type: 'Workspace' };
        const ws2: IWorkspace = { objectId: 'id2', displayName: 'Other Workspace', description: '', type: 'Workspace' };
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([ws1, ws2]);
        workspaceFilterManagerMock.setup(m => m.getVisibleWorkspaceIds()).returns(['id1']);
        workspaceFilterManagerMock.setup(m => m.isWorkspaceVisible('id1')).returns(true);
        workspaceFilterManagerMock.setup(m => m.isWorkspaceVisible('id2')).returns(false);

        showQuickPickStub.callsFake((items: any[]) => {
            // Should see: create, filtered, separator, remaining
            assert.strictEqual(items[0].label.includes('Create'), true, 'First item is create');
            assert.strictEqual(items[1].label, ws1.displayName, 'Second item is filtered workspace');
            assert.strictEqual(items[2].kind, vscode.QuickPickItemKind.Separator, 'Third item is separator');
            assert.strictEqual(items[3].label, ws2.displayName, 'Fourth item is remaining workspace');
            return Promise.resolve(items[1]); // Select filtered workspace
        });

        // Act
        const picked = await act();

        // Assert
        assert.strictEqual(picked?.objectId, 'id1', 'Should pick filtered workspace');
    });

    it('Workspaces are sorted alphabetically by type', async () => {
        const ws1: IWorkspace = { objectId: 'ws-1', displayName: 'Delta', description: '', type: 'Personal' };
        const ws2: IWorkspace = { objectId: 'ws-2', displayName: 'Charlie', description: '', type: 'Workspace' };
        const ws3: IWorkspace = { objectId: 'ws-3', displayName: 'Bravo', description: '', type: 'Personal' };
        const ws4: IWorkspace = { objectId: 'ws-4', displayName: 'Alpha', description: '', type: 'Workspace' };
        // listWorkspaces is expected to sort the workspaces
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([ws3, ws1, ws4, ws2]);
        let receivedItems: vscode.QuickPickItem[] = [];
        showQuickPickStub.callsFake((items: vscode.QuickPickItem[]) => {
            receivedItems = items;
            return Promise.resolve(undefined);
        });

        // Act
        await act();

        // Assert
        // The first item is always "Create new...", so skip it for sorting check
        const workspaceNames = receivedItems.slice(1).map(item => item.label);
        const expectedOrder = [ws3, ws1, ws4, ws2].map(ws => ws.displayName);
        assert.deepStrictEqual(workspaceNames, expectedOrder, 'Workspaces should be sorted alphabetically by type');
    });

    it('User selects existing workspace', async () => {
        // Arrange
        workspaceManagerMock.setup(m => m.listWorkspaces()).returnsAsync([personalWorkspace, otherWorkspace]);

        // The quick pick items are: [create, personal, other]
        showQuickPickStub.callsFake((items: vscode.QuickPickItem[]) => {
            // Select the other workspace
            return Promise.resolve(items.find(i => i.label.includes(otherWorkspace.displayName)));
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

        showQuickPickStub.callsFake((items: vscode.QuickPickItem[]) => {
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

        showQuickPickStub.callsFake((items: vscode.QuickPickItem[]) => {
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
            workspaceFilterManagerMock.object(),
            capacityManagerMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object()
        );
    }
});
