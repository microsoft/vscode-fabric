// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-object-injection */
/* eslint-disable @typescript-eslint/naming-convention */
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import { TelemetryService } from '../../../src/telemetry/TelemetryService';
import TelemetryReporter from '@vscode/extension-telemetry';

describe('TelemetryService', () => {
    let telemetryReporterMock: Mock<TelemetryReporter>;

    beforeEach(() => {
        telemetryReporterMock = new Mock<TelemetryReporter>();

        telemetryReporterMock
            .setup(i => i.sendTelemetryEvent(It.IsAny<string>(), It.IsAny(), It.IsAny()))
            .returns(undefined);
        telemetryReporterMock
            .setup(i => i.sendTelemetryErrorEvent(It.IsAny<string>(), It.IsAny(), It.IsAny()))
            .returns(undefined);
        telemetryReporterMock.setup(i => i.dispose()).returns(Promise.resolve());
    });

    it('should initialize with correct options', () => {
        // Create service instance with explicit extensionMode
        const service = new TelemetryService(
            telemetryReporterMock.object(),
            { extensionMode: 1 }
        );
        // Define expected default properties
        const expected = { 'common.extensionMode': '1' };
        // Verify default properties are set correctly
        assert.deepStrictEqual(service.defaultProps, expected);
    });

    it('should send telemetry event with default properties', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );
        // Add a default property using public API (to be merged into all events)
        service.addOrUpdateDefaultProperty('version', '1.0.0');

        // Define custom props for this event
        const props = { property1: 'value1' };

        // Build expected merged properties (custom + default)
        const expectedProps: Record<string, string> = {
            ...props,
            'common.version': '1.0.0',
        };

        // Send telemetry event, should include both custom and default props
        service.sendTelemetryEvent('test-event', props);

        // Verify reporter was called once with the correctly merged property bag
        telemetryReporterMock.verify(
            i => i.sendTelemetryEvent(
                'test-event',
                It.Is<Record<string, string>>(p =>
                    Object.keys(expectedProps).every(k => p[k] === expectedProps[k])
                ),
                It.IsAny()
            ),
            Times.Once()
        );
    });

    it('should update default properties when update function is provided', () => {
        // Define update function that provides custom default properties
        const updateFn = () => ({ 'common.updatedProp': 'updatedValue' });

        // Create service with update function in configuration
        const service = new TelemetryService(
            telemetryReporterMock.object(),
            { updateDefaultPropertiesFunction: updateFn }
        );

        // Send telemetry event (no custom props)
        service.sendTelemetryEvent('test-event');

        // Verify default props match what the update function returns
        assert.deepStrictEqual(service.defaultProps, updateFn());
        // Verify reporter was called once with expected properties
        telemetryReporterMock.verify(
            i => i.sendTelemetryEvent(
                'test-event',
                It.Is<Record<string, string>>(p => p['common.updatedProp'] === 'updatedValue'),
                undefined
            ),
            Times.Once()
        );
    });

    it('should send error telemetry with error details', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Create test error with specific name and stack
        const err = new Error('Test error');
        err.name = 'TestError';
        err.stack = 'Test stack trace';

        // Send error telemetry with context
        service.sendTelemetryErrorEvent(err, { context: 'test-context' });

        // Verify reporter was called once
        telemetryReporterMock.verify(
            i => i.sendTelemetryErrorEvent(
                'extension/error',
                It.Is<Record<string, string>>(
                    p =>
                        p['exceptiontype'] === 'TestError' &&
                        p['exceptionStack'] === 'Test stack trace' &&
                        p['context'] === 'test-context'
                ),
                undefined
            ),
            Times.Once()
        );
    });

    it('should handle string errors', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Send error telemetry with string message
        service.sendTelemetryErrorEvent('String error message');

        // Verify reporter was called once
        telemetryReporterMock.verify(
            i => i.sendTelemetryErrorEvent(
                'extension/error',
                It.Is<Record<string, string>>(p => p['errormessage'] === 'String error message'),
                undefined
            ),
            Times.Once()
        );
    });

    it('should add or update default property', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Add a new default property and verify it's set with 'common.' prefix
        service.addOrUpdateDefaultProperty('testKey', 'testValue');
        assert.strictEqual(service.defaultProps['common.testKey'], 'testValue');

        // Update the same property and verify its value changes
        service.addOrUpdateDefaultProperty('testKey', 'updatedValue');
        assert.strictEqual(service.defaultProps['common.testKey'], 'updatedValue');
    });

    it('should remove property when addOrUpdateDefaultProperty is called with undefined', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Add a property first
        service.addOrUpdateDefaultProperty('removeTest', 'someValue');
        assert.strictEqual(service.defaultProps['common.removeTest'], 'someValue');

        // Then remove it by passing undefined
        service.addOrUpdateDefaultProperty('removeTest', undefined);

        // Verify the property has been removed
        assert.strictEqual(service.defaultProps['common.removeTest'], undefined);
    });

    it('should update existing property instead of adding a new entry', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Add a property first
        service.addOrUpdateDefaultProperty('updateTest', 'initialValue');
        assert.strictEqual(service.defaultProps['common.updateTest'], 'initialValue');

        // Get the number of properties before update
        const propsCountBefore = Object.keys(service.defaultProps).length;

        // Update the property
        service.addOrUpdateDefaultProperty('updateTest', 'updatedValue');

        // Get the number of properties after update
        const propsCountAfter = Object.keys(service.defaultProps).length;

        // Verify the property was updated
        assert.strictEqual(service.defaultProps['common.updateTest'], 'updatedValue');

        // Verify no new entry was added (count remains the same)
        assert.strictEqual(propsCountBefore, propsCountAfter);
    });

    it('should throw error when trying to update default properties from satellite extension', () => {
        // Create a dummy update function
        const updateFn = () => ({});
        // Create service with update function (simulating satellite extension)
        const service = new TelemetryService(
            telemetryReporterMock.object(),
            { updateDefaultPropertiesFunction: updateFn }
        );

        // Verify that attempting to update properties throws the expected error
        assert.throws(
            () => service.addOrUpdateDefaultProperty('x', 'y'),
            /Cannot update default properties in a satellite extension/
        );
    });

    it('should dispose the telemetry reporter', async () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Dispose the service
        await service.dispose();

        // Verify reporter's dispose method was called once
        telemetryReporterMock.verify(i => i.dispose(), Times.Once());
    });

    it('should use consistent common prefix for default properties', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Add multiple properties
        service.addOrUpdateDefaultProperty('prop1', 'value1');
        service.addOrUpdateDefaultProperty('prop2', 'value2');

        // Verify all properties have the common. prefix
        assert.strictEqual(service.defaultProps['common.prop1'], 'value1');
        assert.strictEqual(service.defaultProps['common.prop2'], 'value2');

        // Make sure properties are accessible in telemetry events
        service.sendTelemetryEvent('test-event');

        telemetryReporterMock.verify(
            i => i.sendTelemetryEvent(
                'test-event',
                It.Is<Record<string, string>>(p =>
                    p['common.prop1'] === 'value1' &&
                    p['common.prop2'] === 'value2'
                ),
                undefined
            ),
            Times.Once()
        );
    });

    it('should handle empty or undefined telemetry properties', () => {
        // Create service instance
        const service = new TelemetryService(
            telemetryReporterMock.object()
        );

        // Add properties first
        service.addOrUpdateDefaultProperty('ismicrosoftinternal', 'true');
        service.addOrUpdateDefaultProperty('tenantid', 'some-tenant-id');
        service.addOrUpdateDefaultProperty('useralias', 'alias');

        // Verify they exist
        assert.strictEqual(service.defaultProps['common.ismicrosoftinternal'], 'true');
        assert.strictEqual(service.defaultProps['common.tenantid'], 'some-tenant-id');
        assert.strictEqual(service.defaultProps['common.useralias'], 'alias');

        // Now clear them using undefined
        service.addOrUpdateDefaultProperty('ismicrosoftinternal', undefined);
        service.addOrUpdateDefaultProperty('tenantid', undefined);
        service.addOrUpdateDefaultProperty('useralias', undefined);

        // Verify they are removed
        assert.strictEqual(service.defaultProps['common.ismicrosoftinternal'], undefined);
        assert.strictEqual(service.defaultProps['common.tenantid'], undefined);
        assert.strictEqual(service.defaultProps['common.useralias'], undefined);

        // Ensure they don't appear in sent telemetry
        service.sendTelemetryEvent('test-event');

        telemetryReporterMock.verify(
            i => i.sendTelemetryEvent(
                'test-event',
                It.Is<Record<string, string>>(p =>
                    p['common.ismicrosoftinternal'] === undefined &&
                    p['common.tenantid'] === undefined &&
                    p['common.useralias'] === undefined
                ),
                undefined
            ),
            Times.Once()
        );
    });
});
