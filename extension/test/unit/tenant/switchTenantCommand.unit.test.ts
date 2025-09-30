// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';

// Import the module being tested and required interfaces
import { switchTenantCommand } from '../../../src/tenant/switchTenantCommand';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';
import { TelemetryService, ILogger, TelemetryActivity, TelemetryEventRecord } from '@microsoft/vscode-fabric-util';
import { IAccountProvider, ITenantSettings } from '../../../src/authentication/interfaces';

describe('switchTenantCommand', function () {
    // Declare mocks
    let mockAccountProvider: Mock<IAccountProvider>;
    let mockLogger: Mock<ILogger>;
    let mockTelemetryActivity: Mock<TelemetryActivity<TelemetryEventRecord, string>>;
    let showInputBoxStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    // Runs before each test
    beforeEach(function () {
        // Initialize mocks for each test
        mockAccountProvider = new Mock<IAccountProvider>();
        mockLogger = new Mock<ILogger>();
        mockTelemetryActivity = new Mock<TelemetryActivity<TelemetryEventRecord, string>>();

        // Setup telemetry activity mock to allow addOrUpdateProperties calls
        mockTelemetryActivity.setup(instance => instance.addOrUpdateProperties(It.IsAny())).returns();

        // Stub vscode.window methods
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    });

    // Runs after each test
    afterEach(function () {
        sinon.restore();
    });

    it('should prompt for manual tenant entry when no tenants are available', async function () {
        // Arrange
        const manualTenantId = 'contoso.onmicrosoft.com';

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve([]));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));
        mockAccountProvider.setup(instance => instance.signIn(manualTenantId)).returns(Promise.resolve(true));

        showInputBoxStub.resolves(manualTenantId);

        // Act
        await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());

        // Assert
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showInputBoxStub.calledOnce, true);
        mockAccountProvider.verify(instance => instance.signIn(manualTenantId), Times.Once());
    });

    it('should allow selecting a tenant from available tenants', async function () {
        // Arrange
        const tenants: ITenantSettings[] = [
            {
                tenantId: 'tenant1',
                displayName: 'Tenant 1',
                defaultDomain: 'tenant1.onmicrosoft.com',
            },
            {
                tenantId: 'tenant2',
                displayName: 'Tenant 2',
                defaultDomain: 'tenant2.onmicrosoft.com',
            },
        ];

        const selectedTenant = {
            label: 'Tenant 1',
            description: 'tenant1.onmicrosoft.com',
            id: 'tenant1',
        };

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve(tenants));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));
        mockAccountProvider.setup(instance => instance.signIn(selectedTenant.id)).returns(Promise.resolve(true));

        showQuickPickStub.resolves(selectedTenant);

        // Act
        await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());

        // Assert
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showQuickPickStub.calledOnce, true);
        mockAccountProvider.verify(instance => instance.signIn(selectedTenant.id), Times.Once());
    });

    it('should throw UserCancelledError if user cancels tenant selection', async function () {
        // Arrange
        const tenants: ITenantSettings[] = [
            {
                tenantId: 'tenant1',
                displayName: 'Tenant 1',
                defaultDomain: 'tenant1.onmicrosoft.com',
            },
        ];

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve(tenants));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));

        // User cancelled by returning undefined
        showQuickPickStub.resolves(undefined);

        // Act & Assert
        let thrownError: any;
        try {
            await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());
        }
        catch (error) {
            thrownError = error;
        }

        assert.strictEqual(thrownError instanceof UserCancelledError, true);
        assert.strictEqual(thrownError.stepName, 'tenantSelection');
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showQuickPickStub.calledOnce, true);
        mockAccountProvider.verify(instance => instance.signIn(It.IsAny()), Times.Never());
    });

    it('should throw UserCancelledError with empty string tenant ID', async function () {
        // Arrange

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve([]));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));

        // User entered an empty string
        showInputBoxStub.resolves('');

        // Act & Assert
        let thrownError: any;
        try {
            await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());
        }
        catch (error) {
            thrownError = error;
        }

        assert.strictEqual(thrownError instanceof UserCancelledError, true);
        assert.strictEqual(thrownError.stepName, 'tenantEntry');
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showInputBoxStub.calledOnce, true);
        // Empty string is falsy, so signIn should not be called
        mockAccountProvider.verify(instance => instance.signIn(It.IsAny()), Times.Never());
    });

    it('should throw UserCancelledError if user cancels manual tenant entry', async function () {
        // Arrange

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve([]));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));

        // User cancelled by returning undefined for manual entry
        showInputBoxStub.resolves(undefined);

        // Act & Assert
        let thrownError: any;
        try {
            await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());
        }
        catch (error) {
            thrownError = error;
        }

        assert.strictEqual(thrownError instanceof UserCancelledError, true);
        assert.strictEqual(thrownError.stepName, 'tenantEntry');
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showInputBoxStub.calledOnce, true);
        mockAccountProvider.verify(instance => instance.signIn(It.IsAny()), Times.Never());
    });

    it('should not refresh workspace connection if sign in fails', async function () {
        // Arrange
        const tenants: ITenantSettings[] = [
            {
                tenantId: 'tenant1',
                displayName: 'Tenant 1',
                defaultDomain: 'tenant1.onmicrosoft.com',
            },
        ];

        const selectedTenant = {
            label: 'Tenant 1',
            description: 'tenant1.onmicrosoft.com',
            id: 'tenant1',
        };

        // Setup mocks
        mockAccountProvider.setup(instance => instance.getTenants()).returns(Promise.resolve(tenants));
        mockAccountProvider.setup(instance => instance.getCurrentTenant()).returns(Promise.resolve(undefined));

        // Sign in fails
        mockAccountProvider.setup(instance => instance.signIn(selectedTenant.id)).returns(Promise.resolve(false));

        showQuickPickStub.resolves(selectedTenant);

        // Act
        await switchTenantCommand(mockAccountProvider.object(), mockTelemetryActivity.object());

        // Assert
        mockAccountProvider.verify(instance => instance.getTenants(), Times.Once());
        assert.strictEqual(showQuickPickStub.calledOnce, true);
        mockAccountProvider.verify(instance => instance.signIn(selectedTenant.id), Times.Once());
        // We shouldn't try to refresh the connection if signIn returns false
    });
});
