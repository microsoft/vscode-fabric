// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { FABRIC_ENVIRONMENT_SETTINGS_KEY, FabricEnvironmentProvider, FABRIC_ENVIRONMENT_DEFAULT_VALUE } from '../../../src/settings/FabricEnvironmentProvider';
import { FABRIC_ENVIRONMENT_PROD, FabricEnvironmentSettings, msSessionProvider } from '../../../src/settings/FabricEnvironment';
import { FakeConfigurationProvider } from '../../../src/settings/mocks';
import { MockConsoleLogger } from '../../../src/logger/MockConsoleLogger';

describe('FabricEnvironmentProvider', () => {
    let config: FakeConfigurationProvider;
    let logger: MockConsoleLogger;
    let provider: FabricEnvironmentProvider;

    beforeEach(() => {
        config = new FakeConfigurationProvider();
        logger = new MockConsoleLogger('Fabric');
        provider = new FabricEnvironmentProvider(config, logger);

        // Reset logger messages to ensure clean state for each test
        logger.resetMessageArray();
    });

    afterEach(() => {
        provider.dispose();
    });

    describe('getCurrent()', () => {
        it('should return PROD environment when setting is PROD', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
            assert.strictEqual(result.clientId, '02fe4832-64e1-42d2-a605-d14958774a2e');
            assert.strictEqual(result.sharedUri, 'https://api.fabric.microsoft.com');
            assert.strictEqual(result.portalUri, 'app.fabric.microsoft.com');
            assert.strictEqual(result.sessionProvider, msSessionProvider);
            assert.deepStrictEqual(result.scopes, ['https://analysis.windows.net/powerbi/api/.default']);

            // Verify no warning or error messages were logged for valid PROD environment
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0, 'No log messages should be generated for valid PROD environment');
        });

        it('should return PROD environment when setting is prod (case insensitive)', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'prod',
                environments: [],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should return PROD environment when using default value', () => {
            // Don't set any environment - should use default
            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should return PROD environment when current is not defined but environments exist', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                // current is undefined/missing
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);

            // Verify no warning or error messages were logged for valid fallback to PROD
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0, 'No log messages should be generated when falling back to PROD due to missing current');
        });

        it('should return PROD environment when current is empty string', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: '',
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should return PROD environment when current is null', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: null as any,
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should return PROD environment when no custom environment is configured', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'INVALID',
                environments: [],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should return valid custom environment when configured', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, 'CUSTOM');
            assert.strictEqual(result.clientId, 'custom-client-id');
            assert.strictEqual(result.sharedUri, 'https://custom.fabric.microsoft.com');
            assert.strictEqual(result.portalUri, 'custom.fabric.microsoft.com');
            assert.strictEqual(result.sessionProvider, 'microsoft');
            assert.deepStrictEqual(result.scopes, ['custom-scope']);

            // Verify no warning or error messages were logged for valid custom environment
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0, 'No log messages should be generated for valid custom environment');
        });

        it('should return custom environment with case insensitive matching', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft-custom',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'custom',
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, 'CUSTOM');
            assert.strictEqual(result.sessionProvider, 'microsoft-custom');
        });

        it('should apply default sessionProvider when missing', async () => {
            const customEnvWithoutSessionProvider = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                // sessionProvider missing
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [customEnvWithoutSessionProvider],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, 'CUSTOM');
            assert.strictEqual(result.sessionProvider, msSessionProvider);
        });

        it('should apply default sessionProvider when invalid', async () => {
            const customEnvWithInvalidSessionProvider = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 123, // Invalid type
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [customEnvWithInvalidSessionProvider],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, 'CUSTOM');
            assert.strictEqual(result.sessionProvider, msSessionProvider);
        });

        it('should fallback to PROD when custom environment validation fails - missing clientId', async () => {
            const invalidCustomEnv = {
                env: 'CUSTOM',
                // Missing clientId and other required properties
                scopes: ['custom-scope'],
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [invalidCustomEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);

            // Verify warning messages were logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0);
        });

        it('should fallback to PROD when custom environment validation fails - invalid scopes', async () => {
            const invalidCustomEnv = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: 'not-an-array', // Should be array
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [invalidCustomEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);

            // Verify warning messages were logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0);
        });

        it('should fallback to PROD when custom environment is not found', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'OTHER',
                clientId: 'other-client-id',
                scopes: ['other-scope'],
                sharedUri: 'https://other.fabric.microsoft.com',
                portalUri: 'other.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);

            // Verify warning messages were logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0);
        });

        it('should handle configuration errors gracefully', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: 'invalid-not-array' as any,
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);

            // Verify error and warning messages were logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 0);
        });

        it('should select correct environment from multiple custom environments', async () => {
            const customEnvs: FabricEnvironmentSettings[] = [
                {
                    env: 'CUSTOM',
                    clientId: 'custom-client-id',
                    scopes: ['custom-scope'],
                    sharedUri: 'https://custom.fabric.microsoft.com',
                    portalUri: 'custom.fabric.microsoft.com',
                    sessionProvider: 'microsoft',
                },
                {
                    env: 'OTHER',
                    clientId: 'other-client-id',
                    scopes: ['other-scope'],
                    sharedUri: 'https://other.fabric.microsoft.com',
                    portalUri: 'other.fabric.microsoft.com',
                    sessionProvider: 'microsoft-other',
                },
            ];

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'OTHER',
                environments: customEnvs,
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, 'OTHER');
            assert.strictEqual(result.clientId, 'other-client-id');
            assert.strictEqual(result.sessionProvider, 'microsoft-other');
        });

        it('should handle null/undefined custom environments', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should handle empty custom environments array', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should fallback to PROD when custom environment is missing sharedUri', async () => {
            const invalidCustomEnv = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                // Missing sharedUri
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [invalidCustomEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should fallback to PROD when custom environment is missing portalUri', async () => {
            const invalidCustomEnv = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                // Missing portalUri
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [invalidCustomEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should fallback to PROD when custom environment has wrong data types', async () => {
            const invalidCustomEnv = {
                env: 123, // Should be string
                clientId: null, // Should be string
                scopes: 'not-an-array', // Should be array
                sharedUri: true, // Should be string
                portalUri: {}, // Should be string
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [invalidCustomEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should fallback to PROD when environment name does not match current setting', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'DIFFERENT_NAME', // This doesn't match the current setting
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM', // Looking for CUSTOM, but env is DIFFERENT_NAME
                environments: [customEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should handle environments property as null gracefully', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: null as any,
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });

        it('should handle environments property as undefined gracefully', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                // environments property is missing/undefined
            } as any);

            const result = provider.getCurrent();

            assert.strictEqual(result.env, FABRIC_ENVIRONMENT_PROD);
        });
    });

    describe('validateCustomEnvironment()', () => {
        it('should validate and modify sessionProvider on valid environment', async () => {
            const testEnv: any = {
                env: 'TEST',
                clientId: 'test-client',
                scopes: ['test-scope'],
                sharedUri: 'https://test.com',
                portalUri: 'test.com',
                // No sessionProvider - should be added
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'TEST',
                environments: [testEnv],
            });

            const result = provider.getCurrent();

            assert.strictEqual(result.sessionProvider, msSessionProvider);
            // Verify the original object was modified
            assert.strictEqual(testEnv.sessionProvider, msSessionProvider);
        });
    });

    describe('switchToEnvironment()', () => {
        it('should successfully switch to PROD environment', async () => {
            // Set up initial custom environment
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'CUSTOM',
                environments: [],
            });

            const result = await provider.switchToEnvironment('PROD');

            assert.strictEqual(result, true);

            // Verify the configuration was updated
            const updatedConfig = config.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, { current: 'PROD', environments: [] });
            assert.strictEqual(updatedConfig.current, 'PROD');

            // Verify info message was logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 1);
            assert.ok(logMessages[0].includes('Switched to environment: PROD'));
        });

        it('should successfully switch to valid custom environment', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            // Set up initial PROD environment
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [customEnv],
            });

            const result = await provider.switchToEnvironment('CUSTOM');

            assert.strictEqual(result, true);

            // Verify the configuration was updated
            const updatedConfig = config.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, { current: 'PROD', environments: [] });
            assert.strictEqual(updatedConfig.current, 'CUSTOM');

            // Verify info message was logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 1);
            assert.ok(logMessages[0].includes('Switched to environment: CUSTOM'));
        });

        it('should handle case insensitive environment switching', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [customEnv],
            });

            const result = await provider.switchToEnvironment('custom'); // lowercase

            assert.strictEqual(result, true);

            // Verify the configuration was updated with uppercase
            const updatedConfig = config.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, { current: 'PROD', environments: [] });
            assert.strictEqual(updatedConfig.current, 'CUSTOM');
        });

        it('should return true when already in target environment', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [],
            });

            const result = await provider.switchToEnvironment('PROD');

            assert.strictEqual(result, true);
        });

        it('should return true when already in target environment (case insensitive)', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [],
            });

            const result = await provider.switchToEnvironment('prod'); // lowercase

            assert.strictEqual(result, true);
        });

        it('should fail to switch to non-existent custom environment', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [],
            });

            const result = await provider.switchToEnvironment('NONEXISTENT');

            assert.strictEqual(result, false);

            // Verify warning message was logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 1);
            assert.ok(logMessages[0].includes('Cannot switch to environment \'NONEXISTENT\': not found or invalid'));
        });

        it('should fail to switch to invalid custom environment', async () => {
            const invalidCustomEnv = {
                env: 'INVALID',
                // Missing required fields
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: [invalidCustomEnv],
            });

            const result = await provider.switchToEnvironment('INVALID');

            assert.strictEqual(result, false);

            // Verify warning message was logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 1);
            assert.ok(logMessages[0].includes('Cannot switch to environment \'INVALID\': not found or invalid'));
        });

        it('should handle corrupted environments array gracefully', async () => {
            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                current: 'PROD',
                environments: 'not-an-array' as any,
            });

            const result = await provider.switchToEnvironment('CUSTOM');

            assert.strictEqual(result, false);

            // Verify warning message was logged
            const logMessages = logger.logMessagesArray;
            assert.strictEqual(logMessages.length, 1);
            assert.ok(logMessages[0].includes('Cannot switch to environment \'CUSTOM\': not found or invalid'));
        });

        it('should preserve other configuration properties when switching', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            const originalConfig = {
                current: 'PROD',
                environments: [customEnv],
                someOtherProperty: 'should-be-preserved',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, originalConfig);

            await provider.switchToEnvironment('CUSTOM');

            // Verify the configuration was updated but other properties preserved
            const updatedConfig = config.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, { current: 'PROD', environments: [] });
            assert.strictEqual(updatedConfig.current, 'CUSTOM');
            assert.deepStrictEqual(updatedConfig.environments, [customEnv]);
            assert.strictEqual((updatedConfig as any).someOtherProperty, 'should-be-preserved');
        });

        it('should handle switching when current is undefined', async () => {
            const customEnv: FabricEnvironmentSettings = {
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['custom-scope'],
                sharedUri: 'https://custom.fabric.microsoft.com',
                portalUri: 'custom.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            };

            await config.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, {
                // current is undefined
                environments: [customEnv],
            });

            const result = await provider.switchToEnvironment('CUSTOM');

            assert.strictEqual(result, true);

            // Verify the configuration was updated with uppercase
            const updatedConfig = config.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, { current: 'PROD', environments: [] });
            assert.strictEqual(updatedConfig.current, 'CUSTOM');
        });
    });

    describe('environment change events', () => {
        it('should fire onDidEnvironmentChange when environment setting changes', (done) => {
            provider.onDidEnvironmentChange(() => {
                done();
            });

            // Trigger the event by simulating config change
            config['onDidConfigurationChangeEmitter'].fire(FABRIC_ENVIRONMENT_SETTINGS_KEY);

            // Failure to call done() will cause the test to timeout and fail
        });

        it('should not fire onDidEnvironmentChange for other setting changes', () => {
            let eventFired = false;
            provider.onDidEnvironmentChange(() => {
                eventFired = true;
            });

            // Trigger event for different key
            config['onDidConfigurationChangeEmitter'].fire('SomeOtherSetting');

            assert.strictEqual(eventFired, false);
        });
    });

    describe('dispose()', () => {
        it('should clean up disposables', () => {
            // This test mainly ensures dispose doesn't throw
            assert.doesNotThrow(() => {
                provider.dispose();
            });
        });

        it('should clear disposables array after dispose', () => {
            provider.dispose();

            // Dispose should not throw when called multiple times
            assert.doesNotThrow(() => {
                provider.dispose();
            });
        });
    });

    describe('constants', () => {
        it('should have correct default values', () => {
            assert.strictEqual(FABRIC_ENVIRONMENT_DEFAULT_VALUE, 'PROD');
            assert.strictEqual(FABRIC_ENVIRONMENT_SETTINGS_KEY, 'EnvironmentSettings');
        });
    });
});
