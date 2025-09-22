// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-object-injection */
/* eslint-disable @typescript-eslint/naming-convention */
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import { TelemetryEvent, TelemetryEventRecord } from '../../../telemetry/TelemetryEvent';
import { TelemetryService } from '../../../telemetry/TelemetryService';

describe('TelemetryEvent', function () {
    // Define a test event record with typed properties and measurements
    interface TestEventNames extends TelemetryEventRecord {
        'test/event': { properties: 'propA' | 'propB' | 'propC'; measurements: 'measureA' | 'measureB' | 'measureC' };
    }

    let telemetryServiceMock: Mock<TelemetryService>;

    before(function () {
        // Setup operations that need to happen once before all tests
    });

    beforeEach(function () {
        // Initialize mocks for each test
        telemetryServiceMock = new Mock<TelemetryService>();

        // Setup common mock behaviors
        telemetryServiceMock
            .setup(i => i.sendTelemetryEvent(It.IsAny<string>(), It.IsAny(), It.IsAny()))
            .returns(undefined);
    });

    afterEach(function () {
        // Clean up after each test
    });

    after(function () {
        // Teardown operations after all tests complete
    });

    it('should initialize with empty properties and measurements', function () {
        // Arrange & Act
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );

        // Assert
        // Use reflection to access protected properties for testing
        const properties = (telemetryEvent as any).properties;
        const measurements = (telemetryEvent as any).measurements;

        assert.deepStrictEqual(properties, {}, 'Properties should be initialized as empty object');
        assert.deepStrictEqual(measurements, {}, 'Measurements should be initialized as empty object');
    });

    it('should add properties correctly', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        const testProperties = {
            propA: 'valueA',
            propB: 'valueB',
        };

        // Act
        telemetryEvent.addOrUpdateProperties(testProperties);

        // Assert
        const properties = (telemetryEvent as any).properties;
        assert.strictEqual(properties['propA'], 'valueA', 'Property A should be set correctly');
        assert.strictEqual(properties['propB'], 'valueB', 'Property B should be set correctly');
        assert.strictEqual(Object.keys(properties).length, 2, 'Should have exactly 2 properties');
    });

    it('should add measurements correctly', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        const testMeasurements = {
            measureA: 10,
            measureB: 20.5,
        };

        // Act
        telemetryEvent.addOrUpdateMeasurements(testMeasurements);

        // Assert
        const measurements = (telemetryEvent as any).measurements;
        assert.strictEqual(measurements['measureA'], 10, 'Measurement A should be set correctly');
        assert.strictEqual(measurements['measureB'], 20.5, 'Measurement B should be set correctly');
        assert.strictEqual(Object.keys(measurements).length, 2, 'Should have exactly 2 measurements');
    });

    it('should update existing properties', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        telemetryEvent.addOrUpdateProperties({ propA: 'initialValue' });

        // Act
        telemetryEvent.addOrUpdateProperties({ propA: 'updatedValue' });

        // Assert
        const properties = (telemetryEvent as any).properties;
        assert.strictEqual(properties['propA'], 'updatedValue', 'Property should be updated correctly');
    });

    it('should update existing measurements', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        telemetryEvent.addOrUpdateMeasurements({ measureA: 10 });

        // Act
        telemetryEvent.addOrUpdateMeasurements({ measureA: 20 });

        // Assert
        const measurements = (telemetryEvent as any).measurements;
        assert.strictEqual(measurements['measureA'], 20, 'Measurement should be updated correctly');
    });

    it('should ignore null or undefined property values', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        const testProperties = {
            propA: 'valueA',
            propB: null as unknown as string,
            propC: undefined as unknown as string,
        };

        // Act
        telemetryEvent.addOrUpdateProperties(testProperties);

        // Assert
        const properties = (telemetryEvent as any).properties;
        assert.strictEqual(properties['propA'], 'valueA', 'Property A should be set correctly');
        assert.strictEqual(Object.keys(properties).length, 1, 'Should have only one valid property');
        assert.strictEqual(properties['propB'], undefined, 'Property B should be ignored');
        assert.strictEqual(properties['propC'], undefined, 'Property C should be ignored');
    });

    it('should ignore null or undefined measurement values', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        const testMeasurements = {
            measureA: 10,
            measureB: null as unknown as number,
            measureC: undefined as unknown as number,
        };

        // Act
        telemetryEvent.addOrUpdateMeasurements(testMeasurements);

        // Assert
        const measurements = (telemetryEvent as any).measurements;
        assert.strictEqual(measurements['measureA'], 10, 'Measurement A should be set correctly');
        assert.strictEqual(Object.keys(measurements).length, 1, 'Should have only one valid measurement');
        assert.strictEqual(measurements['measureB'], undefined, 'Measurement B should be ignored');
        assert.strictEqual(measurements['measureC'], undefined, 'Measurement C should be ignored');
    });

    it('should send telemetry event with correct properties and measurements', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            telemetryServiceMock.object()
        );
        telemetryEvent.addOrUpdateProperties({ propA: 'valueA' });
        telemetryEvent.addOrUpdateMeasurements({ measureA: 10 });

        // Act
        telemetryEvent.sendTelemetry();

        // Assert
        telemetryServiceMock.verify(
            s => s.sendTelemetryEvent(
                'test/event',
                It.Is<Record<string, string>>(props => props['propA'] === 'valueA'),
                It.Is<Record<string, number>>(measures => measures['measureA'] === 10)
            ),
            Times.Once()
        );
    });

    it('should not throw when telemetryService is null', function () {
        // Arrange
        const telemetryEvent = new TelemetryEvent<TestEventNames, 'test/event'>(
            'test/event',
            null
        );
        telemetryEvent.addOrUpdateProperties({ propA: 'valueA' });
        telemetryEvent.addOrUpdateMeasurements({ measureA: 10 });

        // Act & Assert
        assert.doesNotThrow(() => {
            telemetryEvent.sendTelemetry();
        }, 'Should not throw when telemetryService is null');
    });
});
