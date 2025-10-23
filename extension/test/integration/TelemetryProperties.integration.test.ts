// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { activateCore, IFabricEnvironmentProvider, sleep, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../../src/authentication/interfaces';

/**
 * Integration Test for Telemetry Properties Management
 *
 * Test Coverage:
 * - Default telemetry properties set on activation
 * - Fabric environment property updates
 * - Tenant change property updates
 * - Account provider integration with telemetry
 */
describe('Telemetry Properties Integration Tests', function () {
    const testTimeOut = 60 * 1000;

    let core: any;
    let coreApi: any;
    let accountProvider: IAccountProvider;
    let telemetryService: TelemetryService;
    let fabricEnvironmentProvider: IFabricEnvironmentProvider;

    beforeEach(async function () {
        this.timeout(testTimeOut);

        const testHooksEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_HOOKS'] === 'true';
        const testFakesEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_FAKES'] === 'true';

        if (!testHooksEnabled || !testFakesEnabled) {
            throw new Error('Test hooks and fakes must be enabled. Set VSCODE_FABRIC_ENABLE_TEST_HOOKS=true and VSCODE_FABRIC_ENABLE_TEST_FAKES=true');
        }

        core = await activateCore();

        assert(core, 'Failed to activate core extension');
        assert(core.testHooks, 'Failed to get test hooks from core');

        coreApi = core.testHooks['serviceCollection'];
        assert(coreApi, 'Failed to get service collection');

        accountProvider = core.testHooks['accountProvider'] as IAccountProvider;
        assert(accountProvider, 'Failed to get account provider from test hooks');

        telemetryService = core.testHooks['telemetryService'] as TelemetryService;
        assert(telemetryService, 'Failed to get telemetry service from test hooks');

        fabricEnvironmentProvider = core.testHooks['fabricEnvironmentProvider'] as IFabricEnvironmentProvider;
        assert(fabricEnvironmentProvider, 'Failed to get fabric environment provider from test hooks');

        await sleep(2000);
    });

    it('should set default telemetry properties on activate', async function () {
        this.timeout(testTimeOut);

        const defaultProperties = await accountProvider.getDefaultTelemetryProperties();
        assert(defaultProperties, 'Default telemetry properties should be available');

        assert.strictEqual(defaultProperties.tenantid, 'fake-tenant-id');
        assert.strictEqual(defaultProperties.isMicrosoftInternal, 'true');
        assert.strictEqual(defaultProperties.useralias, 'fake-user');

        assert.strictEqual(telemetryService.defaultProps['common.tenantid'], 'fake-tenant-id');
        assert.strictEqual(telemetryService.defaultProps['common.ismicrosoftinternal'], 'true');
        assert.strictEqual(telemetryService.defaultProps['common.useralias'], 'fake-user');
    });

    it('should set fabric environment property on activate', async function () {
        this.timeout(testTimeOut);

        const currentEnvironment = fabricEnvironmentProvider.getCurrent();
        assert(currentEnvironment, 'Current environment should be available');
        assert(currentEnvironment.env, 'Environment should have an env property');

        assert.strictEqual(telemetryService.defaultProps['common.fabricEnvironment'], currentEnvironment.env);
    });

    it('should handle tenant change events properly', async function () {
        this.timeout(testTimeOut);

        const originalAddOrUpdate = telemetryService.addOrUpdateDefaultProperty.bind(telemetryService);

        let capturedCalls: Array<{key: string, value: string}> = [];
        telemetryService.addOrUpdateDefaultProperty = (key: string, value: string) => {
            capturedCalls.push({ key, value });
            return originalAddOrUpdate(key, value);
        };

        const initialProperties = await accountProvider.getDefaultTelemetryProperties();
        assert.strictEqual(initialProperties.tenantid, 'fake-tenant-id');

        // Access the event emitter through the account provider's internal structure
        // Since we're using fake services, we need to trigger the event manually
        const accountProviderAny = accountProvider as any;
        if (accountProviderAny.onTenantChangedEmitter && typeof accountProviderAny.onTenantChangedEmitter.fire === 'function') {
            accountProviderAny.onTenantChangedEmitter.fire();
        }

        // Wait for the event to be processed
        await sleep(100);

        // Verify that addOrUpdateDefaultProperty was called with the tenant ID
        const tenantIdCall = capturedCalls.find(call => call.key === 'tenantid');
        assert(tenantIdCall, 'addOrUpdateDefaultProperty should have been called with common.tenantid');
        assert.strictEqual(tenantIdCall.value, 'fake-tenant-id');

        // Restore original method
        telemetryService.addOrUpdateDefaultProperty = originalAddOrUpdate;
    });
});
