import { Mock, Times } from 'moq.ts';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { makeShouldExpand, recordExpansionChange } from '../../../workspace/viewExpansionState';
import { IFabricExtensionsSettingStorage, IFabricExtensionSettings, IFabricViewState, fabricWorkspaceSettingsVersion } from '../../../settings/definitions';
import { IAccountProvider, ITenantSettings } from '../../../authentication/interfaces';
import { IFabricEnvironmentProvider, FabricEnvironmentName, FabricEnvironmentSettings } from '@microsoft/vscode-fabric-util';

describe('viewExpansionState', function () {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let accountProviderMock: Mock<IAccountProvider>;
    let settings: IFabricExtensionSettings;
    let envProvider: IFabricEnvironmentProvider;

    const TENANT_ID: string = 't1';
    const ENV: FabricEnvironmentName = FabricEnvironmentName.PROD;
    const CONTEXT_KEY: string = `${ENV}:${TENANT_ID}`;

    before(function () {
        // Setup once before all tests if needed
    });

    beforeEach(function () {
        // Real settings object so code can mutate nested properties
        settings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: [],
            artifacts: [],
            displayStyle: 'TreeView',
        } as IFabricExtensionSettings;

        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        accountProviderMock = new Mock<IAccountProvider>();

        storageMock.setup(i => i.settings).returns(settings);
        storageMock.setup(i => i.save()).returns(Promise.resolve());

        // Minimal environment provider implementation
        const emitter = new vscode.EventEmitter<void>();
        envProvider = {
            getCurrent(): FabricEnvironmentSettings {
                return {
                    env: ENV,
                    clientId: 'test-client',
                    scopes: [],
                    sharedUri: '',
                    portalUri: '',
                };
            },
            onDidEnvironmentChange: emitter.event,
        };

        // Account/Tenant
        const tenant: ITenantSettings = {
            tenantId: TENANT_ID,
            displayName: 'Tenant One',
            defaultDomain: 'tenant.one',
        };
        accountProviderMock.setup(i => i.getCurrentTenant()).returns(Promise.resolve(tenant));
    });

    afterEach(function () {
        // nothing to cleanup
    });

    after(function () {
        // Teardown once after all tests if needed
    });

    it('makeShouldExpand respects persisted tenant/workspace/group expansions', async function () {
        // Arrange: seed persisted view state for the current context
        const wsId: string = 'ws123';
        const tenantNodeId: string = `tenant:${TENANT_ID}`;
        const wsNodeId: string = `ws:${TENANT_ID}:${wsId}`;
        const grpNodeId1: string = `grp:${TENANT_ID}:${wsId}:DATASET`;
        const grpNodeId2: string = `grp:${TENANT_ID}:${wsId}:NOTEBOOK`;

        settings.viewState = {};
        settings.viewState[CONTEXT_KEY] = {
            expandedTenants: [tenantNodeId],
            expandedWorkspaces: [wsNodeId],
            expandedGroupsByWorkspace: {
                [wsNodeId]: [grpNodeId1, grpNodeId2],
            },
        };

        // Act
        const shouldExpand = await makeShouldExpand(storageMock.object(), envProvider, accountProviderMock.object());

        // Assert
        assert.equal(shouldExpand(undefined), false, 'undefined should not expand');
        assert.equal(shouldExpand('foo:bar'), false, 'unknown prefix should not expand');

        assert.equal(shouldExpand(tenantNodeId), true, 'tenant persisted as expanded');
        assert.equal(shouldExpand(`tenant:${TENANT_ID}-other`), false, 'other tenant not expanded');

        assert.equal(shouldExpand(wsNodeId), true, 'workspace persisted as expanded');
        assert.equal(shouldExpand(`ws:${TENANT_ID}:otherWs`), false, 'other workspace not expanded');

        assert.equal(shouldExpand(grpNodeId1), true, 'group 1 persisted as expanded');
        assert.equal(shouldExpand(grpNodeId2), true, 'group 2 persisted as expanded');
        assert.equal(shouldExpand(`grp:${TENANT_ID}:${wsId}:OTHER`), false, 'other group not expanded');
        assert.equal(shouldExpand(`grp:${TENANT_ID}-other:${wsId}:DATASET`), false, 'group in different tenant not expanded');
    });

    it('recordExpansionChange persists add/remove for tenant/workspace/group', async function () {
        // Arrange
        settings.viewState = undefined;

        const wsId: string = 'ws999';
        const tenantNodeId: string = `tenant:${TENANT_ID}`;
        const wsNodeId: string = `ws:${TENANT_ID}:${wsId}`;
        const grpNodeId: string = `grp:${TENANT_ID}:${wsId}:NOTEBOOK`;

        // Act: Add expansions
        await recordExpansionChange(storageMock.object(), envProvider, accountProviderMock.object(), tenantNodeId, true);
        await recordExpansionChange(storageMock.object(), envProvider, accountProviderMock.object(), wsNodeId, true);
        await recordExpansionChange(storageMock.object(), envProvider, accountProviderMock.object(), grpNodeId, true);

        // Assert additions
        assert.ok(settings.viewState, 'viewState created');
        const ctx = settings.viewState![CONTEXT_KEY] as IFabricViewState;
        assert.ok(ctx, 'context key created');
        assert.ok(ctx.expandedTenants?.includes(tenantNodeId), 'tenant added to expandedTenants');
        assert.ok(ctx.expandedWorkspaces.includes(wsNodeId), 'workspace added to expandedWorkspaces');
        assert.ok(Array.isArray(ctx.expandedGroupsByWorkspace[wsNodeId]), 'workspace group bucket created');
        assert.ok(ctx.expandedGroupsByWorkspace[wsNodeId].includes(grpNodeId), 'group added to workspace bucket');

        // Act: Remove the group expansion only
        await recordExpansionChange(storageMock.object(), envProvider, accountProviderMock.object(), grpNodeId, false);

        // Assert removal does not affect others
        const ctxAfter = settings.viewState![CONTEXT_KEY] as IFabricViewState;
        assert.ok(ctxAfter.expandedTenants?.includes(tenantNodeId), 'tenant expansion remains');
        assert.ok(ctxAfter.expandedWorkspaces.includes(wsNodeId), 'workspace expansion remains');
        assert.equal(ctxAfter.expandedGroupsByWorkspace[wsNodeId].includes(grpNodeId), false, 'group removed from workspace bucket');

        // Verify save called for each mutation
        storageMock.verify(i => i.save(), Times.Exactly(4));
    });
});
