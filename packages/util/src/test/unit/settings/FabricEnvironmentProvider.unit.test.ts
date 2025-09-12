import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import * as sinon from 'sinon';

import { ILogger } from '../../../logger/Logger';
import { IConfigurationProvider } from '../../../settings/ConfigurationProvider';
import {
    FabricEnvironmentProvider,
    FABRIC_ENVIRONMENT_KEY,
    FABRIC_ENVIRONMENT_DEFAULT_VALUE,
    getFabricEnvironment,
} from '../../../settings/FabricEnvironmentProvider';
import { FabricEnvironmentName } from '../../../settings/FabricEnvironment';

describe('FabricEnvironmentProvider', function () {
    // Declare mocks
    let mockConfigService: Mock<IConfigurationProvider>;
    let mockLogger: Mock<ILogger>;
    let environmentProvider: FabricEnvironmentProvider;
    let configChangeCallback: (key: string) => void;

    // Runs before each test
    beforeEach(function () {
        // Initialize mocks for each test
        mockConfigService = new Mock<IConfigurationProvider>();
        mockLogger = new Mock<ILogger>();

        // Setup common mock behaviors
        mockLogger.setup(instance => instance.log(It.IsAny(), It.IsAny(), It.IsAny())).callback((interaction) => {
            const message = interaction.args[0];
            console.log(message);
        });

        // Setup the onDidConfigurationChange event with a callback capture
        // This approach captures the callback that FabricEnvironmentProvider registers during construction.
        // By storing this callback, our tests can directly trigger configuration change events
        // by calling configChangeCallback with different keys (e.g., FABRIC_ENVIRONMENT_KEY).
        // This allows us to test that only relevant configuration changes trigger environment events
        // while avoiding the complexity of EventEmitter setup and management.
        mockConfigService.setup(instance => instance.onDidConfigurationChange).returns((callback: (key: string) => void) => {
            configChangeCallback = callback;
            return {
                dispose: () => {}, // Return a fake disposable that the provider can dispose
            };
        });

        // Initialize class under test with mocks
        environmentProvider = new FabricEnvironmentProvider(mockConfigService.object(), mockLogger.object());
    });

    // Runs after each test
    afterEach(function () {
        // Clean up after each test
        environmentProvider.dispose();
    });

    it('should return the default environment when not configured', function () {
        // Arrange
        mockConfigService.setup(instance => instance.get<string>(
            FABRIC_ENVIRONMENT_KEY,
            FABRIC_ENVIRONMENT_DEFAULT_VALUE
        )).returns(FABRIC_ENVIRONMENT_DEFAULT_VALUE);

        // Act
        const result = environmentProvider.getCurrent();

        // Assert
        assert.strictEqual(result.env, FabricEnvironmentName.PROD);
        mockConfigService.verify(instance => instance.get<string>(
            FABRIC_ENVIRONMENT_KEY,
            FABRIC_ENVIRONMENT_DEFAULT_VALUE
        ), Times.Once());
    });

    it('should return the configured environment', function () {
        // Arrange
        const testEnvironment = FabricEnvironmentName.EDOG;
        mockConfigService.setup(instance => instance.get<string>(
            FABRIC_ENVIRONMENT_KEY,
            FABRIC_ENVIRONMENT_DEFAULT_VALUE
        )).returns(testEnvironment);

        // Act
        const result = environmentProvider.getCurrent();

        // Assert
        assert.strictEqual(result.env, testEnvironment);
        mockConfigService.verify(instance => instance.get<string>(
            FABRIC_ENVIRONMENT_KEY,
            FABRIC_ENVIRONMENT_DEFAULT_VALUE
        ), Times.Once());
    });

    it('should fire environment change event when the configuration changes', function () {
        // Arrange
        let eventFired = false;
        environmentProvider.onDidEnvironmentChange(() => {
            eventFired = true;
        });

        // Act - simulate a configuration change
        configChangeCallback(FABRIC_ENVIRONMENT_KEY);

        // Assert
        assert.strictEqual(eventFired, true, 'Environment change event should have been fired');
    });

    it('should not fire environment change event when other configuration changes', function () {
        // Arrange
        let eventFired = false;
        environmentProvider.onDidEnvironmentChange(() => {
            eventFired = true;
        });

        // Act - simulate a configuration change for a different key
        configChangeCallback('SomeOtherKey');

        // Assert
        assert.strictEqual(eventFired, false, 'Environment change event should not have been fired');
    });

    it('should properly dispose of event listeners', function () {
        // Arrange
        const mockDispose = sinon.spy();
        const mockDisposable = { dispose: mockDispose };

        // Mock the disposables array by replacing it with our controlled array
        (environmentProvider as any).disposables = [mockDisposable];

        // Act
        environmentProvider.dispose();

        // Assert
        assert.strictEqual(mockDispose.calledOnce, true, 'Disposable should have been disposed');
        assert.deepStrictEqual((environmentProvider as any).disposables, [], 'Disposables array should be cleared');
    });
});

describe('getFabricEnvironment', function () {
    // Declare mocks
    let mockLogger: Mock<ILogger>;

    // Runs before each test
    beforeEach(function () {
        // Initialize mocks for each test
        mockLogger = new Mock<ILogger>();
        mockLogger.setup(instance => instance.log(It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);
    });

    // Runs after each test
    afterEach(function () {
        // Clean up after each test
        sinon.restore();
    });

    it('should return the corresponding environment settings for a valid environment name', function () {
        // Arrange
        const validEnvironment = FabricEnvironmentName.EDOG;

        // Act
        const result = getFabricEnvironment(validEnvironment, mockLogger.object());

        // Assert
        assert.strictEqual(result.env, validEnvironment);
    });

    it('should return the default PROD environment for an invalid environment name', function () {
        // Arrange
        const invalidEnvironment = 'INVALID_ENV';

        // Act
        const result = getFabricEnvironment(invalidEnvironment, mockLogger.object());

        // Assert
        assert.strictEqual(result.env, FabricEnvironmentName.PROD);
    });

    it('should handle case insensitive environment names', function () {
        // Arrange
        const lowerCaseEnvironment = 'edog';

        // Act
        const result = getFabricEnvironment(lowerCaseEnvironment, mockLogger.object());

        // Assert
        assert.strictEqual(result.env, FabricEnvironmentName.EDOG);
    });

    it('should work without a logger', function () {
        // Arrange
        const validEnvironment = FabricEnvironmentName.DAILY;

        // Act
        const result = getFabricEnvironment(validEnvironment, undefined);

        // Assert
        assert.strictEqual(result.env, validEnvironment);
    });
});
