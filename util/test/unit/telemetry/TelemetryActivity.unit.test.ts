// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/naming-convention */
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { TelemetryActivity } from '../../../src/telemetry/TelemetryActivity';
import { TelemetryService } from '../../../src/telemetry/TelemetryService';
import { TelemetryEventRecord } from '../../../src/telemetry/TelemetryEvent';

describe('TelemetryActivity', function () {
    // Declare mocks
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivity: TelemetryActivity<TestEventNames>;
    let dateNowStub: sinon.SinonStub;
    let startTime: number;
    let endTime: number;

    // Sample event name for testing
    const testEventName = 'test/event';
    interface TestEventNames extends TelemetryEventRecord {
        testEventName: { properties: any; measurements: any }
    }

    beforeEach(function () {
        // Initialize mock for TelemetryService
        telemetryServiceMock = new Mock<TelemetryService>();

        // Setup common mock behaviors
        telemetryServiceMock.setup(instance =>
            instance.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);

        // Initialize TelemetryActivity with mock
        telemetryActivity = new TelemetryActivity<TestEventNames>(testEventName, telemetryServiceMock.object());

        // Stub Date.now() to return a fixed value
        dateNowStub = sinon.stub(Date, 'now');
        startTime = 12345;
        endTime = 67890;
        dateNowStub.onFirstCall().returns(startTime);
        dateNowStub.onSecondCall().returns(endTime);
    });

    afterEach(function () {
        // Restore the stub after each test
        dateNowStub.restore();
    });

    it('should call start when constructed', function () {
        const mockTelemetryService = new Mock<TelemetryService>().object();
        const startSpy = sinon.spy();
        class TestTelemetryActivity<T extends TelemetryEventRecord> extends TelemetryActivity<T> {
            override start() {
                startSpy();
                super.start();
            }
        }

        const activity = new TestTelemetryActivity<TestEventNames>(testEventName, mockTelemetryService);

        assert(startSpy.calledOnce, 'start should be called once during construction');
        assert(typeof (activity as any).startTime === 'number' && (activity as any).startTime > 0, 'startTime should be set');
    });

    it('should override startTime when start() is called after construction', function () {
        // Arrange: stub Date.now() to return different values for constructor and start()
        dateNowStub.restore(); // Remove previous stub
        const initialTime = 1000;
        const newStartTime = 2000;
        const stub = sinon.stub(Date, 'now');
        stub.onFirstCall().returns(initialTime); // For constructor
        stub.onSecondCall().returns(newStartTime); // For start()

        const activity = new TelemetryActivity<TestEventNames>(testEventName, telemetryServiceMock.object());

        // Act: call start() again, which should set startTime to newStartTime
        activity.start();

        // Assert: sendTelemetry should report the new startTime
        activity.sendTelemetry();

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.IsAny(),
                It.Is<Record<string, number>>(measurements =>
                    measurements['startTimeInMilliseconds'] === newStartTime
                )
            ),
        Times.Once()
        );

        stub.restore();
    });

    it('should initialize with start time NOT set to 0', function () {
        const activity = new TelemetryActivity<TestEventNames>(testEventName, telemetryServiceMock.object());

        // We're testing a private field, so we'll use sendTelemetry to verify the measurement value
        activity.sendTelemetry();

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.IsAny(),
                It.Is<Record<string, number>>(measurements =>
                    measurements['startTimeInMilliseconds'] !== 0
                )
            ),
        Times.Once());
    });

    it('should set start time when start() is called', function () {
        telemetryActivity.start();
        telemetryActivity.sendTelemetry();

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.IsAny(),
                It.Is<Record<string, number>>(measurements =>
                    measurements['startTimeInMilliseconds'] === startTime
                )
            ),
        Times.Once());
    });

    it('should set end time when end() is called', function () {
        telemetryActivity.start();
        telemetryActivity.end();
        telemetryActivity.sendTelemetry();

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.IsAny(),
                It.Is<Record<string, number>>(measurements =>
                    measurements['startTimeInMilliseconds'] === startTime &&
                    measurements['endTimeInMilliseconds'] === endTime &&
                    measurements['activityDurationInMilliseconds'] === (endTime - startTime)
                )
            ), Times.Once());
    });

    it('should automatically set end time if not set when sendTelemetry() is called', function () {
        telemetryActivity.start();
        telemetryActivity.sendTelemetry(); // This should automatically set end time

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.IsAny(),
                It.Is<Record<string, number>>(measurements =>
                    measurements['endTimeInMilliseconds'] === endTime
                )
            ),
        Times.Once());
    });

    it('should record successful activity with doTelemetryActivity()', async function () {
        const expectedResult = 'success result';

        const result = await telemetryActivity.doTelemetryActivity(async () => {
            return expectedResult;
        });

        assert.equal(result, expectedResult, 'doTelemetryActivity should return the result of the function');

        telemetryServiceMock.verify(instance =>
            instance.sendTelemetryEvent(
                It.Is<string>(name => name === testEventName),
                It.Is<Record<string, string>>(props => props['succeeded'] === 'true'),
                It.Is<Record<string, number>>(measurements =>
                    measurements['startTimeInMilliseconds'] === startTime &&
                    measurements['endTimeInMilliseconds'] === endTime &&
                    measurements['activityDurationInMilliseconds'] === (endTime - startTime)
                )
            ),
        Times.Once());
    });

    it('should call start() with doTelemetryActivity', async function () {
        const startSpy = sinon.spy(telemetryActivity, 'start');

        await telemetryActivity.doTelemetryActivity(async () => {
            return 'some result';
        });

        assert(startSpy.calledOnce, 'start() should be called once');
        startSpy.restore();
    });

    it('should record failed activity with doTelemetryActivity()', async function () {
        const errorMessage = 'Test error message';
        const errorToThrow = new Error(errorMessage);

        try {
            await telemetryActivity.doTelemetryActivity(async () => {
                throw errorToThrow;
            });
            assert.fail('doTelemetryActivity should have thrown an error');
        }
        catch (error) {
            assert.strictEqual(error, errorToThrow, 'doTelemetryActivity should rethrow the original error');

            telemetryServiceMock.verify(instance =>
                instance.sendTelemetryEvent(
                    It.Is<string>(name => name === testEventName),
                    It.Is<Record<string, string>>(props =>
                        props['succeeded'] === 'false' &&
                        props['message'] === errorMessage
                    ),
                    It.Is<Record<string, number>>(measurements =>
                        measurements['startTimeInMilliseconds'] === startTime &&
                        measurements['endTimeInMilliseconds'] === endTime &&
                        measurements['activityDurationInMilliseconds'] === (endTime - startTime)
                    )
                ),
            Times.Once());
        }
    });

    it('should extract error method from stack trace', async function () {
        const errorWithStack = new Error('Test error');
        errorWithStack.stack = 'Error: Test error\n    at Function.methodName (/path/to/file.ts:123:45)\n    at anotherMethod (/another/path.ts:67:89)';

        try {
            await telemetryActivity.doTelemetryActivity(async () => {
                throw errorWithStack;
            });
            assert.fail('doTelemetryActivity should have thrown an error');
        }
        catch (error) {
            telemetryServiceMock.verify(instance =>
                instance.sendTelemetryEvent(
                    It.IsAny(),
                    It.Is<Record<string, string>>(props =>
                        props['method'] === 'at Function.methodName (/path/to/file.ts:123:45)'
                    ),
                    It.IsAny()
                ),
            Times.Once());
        }
    });
});
