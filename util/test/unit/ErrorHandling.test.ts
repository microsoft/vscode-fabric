// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable security/detect-non-literal-fs-filename */
import * as assert from 'assert';

import * as vscode from 'vscode';
import { MockConsoleLogger } from '../../src/logger/Logger';
import { doFabricAction, FabricError, withErrorHandling, doCancelableActionWithErrorHandling, ICanceledError } from '../../src/FabricError';
import { UserCancelledError } from '../../src/UserCancelledError';

const sinon = require('sinon');

describe('ErrorHandling tests', () => {
    const logger = new MockConsoleLogger('FabricTests');

    beforeEach(() => {
        logger.logMessagesArray = [];
    });

    it('FabricErrorTest with doFabricAction', async () => {
        logger.log('Testing FabricError');

        let errorTest = new Error('localized error message');
        assert(!(errorTest instanceof FabricError), 'Expected errorTest to be an instance of Error, actual: ' + errorTest);
        const fabricError = errorTest as FabricError;
        logger.log('casting errorTest as FabricError: ' + fabricError);
        assert(fabricError, 'casting as FabricError yields  ' + fabricError);
        logger.logMessagesArray = [];

        const dialogStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve('Yes'));
        try {
            const fabricError = new FabricError('localized error message', 'error message', { showInUserNotification: 'Information' });
            const func = withErrorHandling('errortests', logger, null, async () => {
                await doFabricAction({ fabricLogger: logger }, async () => {
                    logger.log('throwing fabricError');
                    throw fabricError;
                });
            });
            await func();

            assert(fabricError.didProcessFabricError, 'Expected didProcessFabricError to be true');
            assert(dialogStub.calledOnce, 'Expected showInformationMessage to be called once, actual call count: ' + dialogStub.callCount);
            assert(logger.logMessagesArray.some((log) => log.includes('localized error message')), 'Expected log message to contain "localized error message"');

        }
        finally {
            dialogStub.restore();
        }
    });

    it('FabricErrorTest with nested FabricError in doFabricAction', async () => {
        logger.log('Testing FabricError');
        const dialogStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve('Yes'));
        try {
            const localizedErrrorMessage = 'localized error message';
            const nonlocalizedErrorMessage = 'nonlocalizedError_message';
            const fabricError = new FabricError(localizedErrrorMessage, nonlocalizedErrorMessage, { showInUserNotification: 'Information' });
            const func = withErrorHandling('errortests', logger, null, async () => {
                await doFabricAction({ fabricLogger: logger }, async () => {
                    logger.log('doing first dofabricAction');

                    await doFabricAction({ fabricLogger: logger }, async () => {
                        logger.log('throwing fabricError from nested doFabricAction');
                        throw fabricError;
                    });
                });
            });
            await func();

            assert(fabricError.didProcessFabricError, 'Expected didProcessFabricError to be true');
            assert(dialogStub.calledOnce, 'Expected showInformationMessage to be called once, actual call count: ' + dialogStub.callCount);

            const countExpectedLocalizedMessages = logger.logMessagesArray.filter((log) => log.includes(localizedErrrorMessage)).length; // these come from dofabricaction
            assert(countExpectedLocalizedMessages === 2, `Expected log to contain "${localizedErrrorMessage}" twice, actual count: ${countExpectedLocalizedMessages}`);

            const countNonLocalizedMessages = logger.logMessagesArray.filter((log) => log.includes(nonlocalizedErrorMessage)).length; // these come from withErrorHandling=> logger.reportExceptionTelemetryAndLog
            assert(countNonLocalizedMessages === 1, `Expected log to contain "${nonlocalizedErrorMessage}" once, actual count: ${countNonLocalizedMessages} ` );
        }
        finally {
            dialogStub.restore();
        }
    });

    it('FabricErrorTest with Error()', async () => {
        logger.log('Testing Error()');
        const dialogStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve('Yes'));
        try {
            const normalError = new Error('normal error object');
            const func = withErrorHandling('errortests', logger, null, async () => {
                await doFabricAction({ fabricLogger: logger }, async () => {
                    logger.log('doing first dofabricAction');

                    await doFabricAction({ fabricLogger: logger }, async () => {
                        logger.log('throwing normalError from nested doFabricAction');
                        throw normalError;
                    });
                });
            });
            await func();

            assert(dialogStub.callCount === 0, 'Expected showInformationMessage to be called 0, actual call count: ' + dialogStub.callCount);
            assert(logger.logMessagesArray.some((log) => log.includes('normal error object')), 'Expected log message to contain "normal error object"');
            const countExpectedMessages = logger.logMessagesArray.filter((log) => log.includes('normal error object')).length;
            assert(countExpectedMessages === 2, 'Expected log cnt 2 actual count: ' + countExpectedMessages);
        }
        finally {
            dialogStub.restore();
        }
    });

    it('FabricErrorTest with Promise.Reject()', async () => {
        logger.log('Testing Error()');
        const errorObj = new Error('simple Error() object');
        //("This code repros Bug 1651036: Telemetry from BugBash: TypeError: Cannot create property 'didProcessFabricError' on string 'Timeout Executing task 'extensions install");
        // without fix, causes "TypeError: Cannot create property 'didProcessFabricError' on string 'timeoutRunningTask'"
        const func = withErrorHandling('errortests', logger, null, async () => {
            await doFabricAction({ fabricLogger: logger }, async () => {
                logger.log('starting task');
                // throw 'an error string'; // this is not allowed due to ESlint
                // await Promise.reject(errorObj); // this doesn't repro the issue
                // await Promise.reject('some string'); // this does repro the issue
                const task = new Promise<void>((resolve, reject) => {
                    setTimeout(() => {
                        logger.log('rejecting error after timeout');
                        reject(errorObj);
                    }, 500);
                });
                await task;
            });
        });
        await func();

        logger.log('logger.logMessagesArray: ' + logger.logMessagesArray.length);
        assert(logger.logMessagesArray.some((logmsg) => logmsg.includes('rejecting error after timeout')), 'Expected log message to contain "rejecting error after timeout"');
        assert(!logger.logMessagesArray.some((logmsg) => logmsg.includes("TypeError: Cannot create property 'didProcessFabricError'")), 'Expected log message NOT to contain "Cannot create property"');

    });

    describe('doCancelableActionWithErrorHandling tests', () => {
        let mockTelemetryService: any;
        let telemetryEvents: Array<{ eventName: string, properties: any, measurements: any }>;

        beforeEach(() => {
            telemetryEvents = [];
            mockTelemetryService = {
                sendTelemetryEvent: (eventName: string, properties: any, measurements: any) => {
                    telemetryEvents.push({ eventName, properties, measurements });
                },
                sendTelemetryErrorEvent: (errorOrEventName: any, properties?: any, measurements?: any) => {
                    // Handle both calling patterns:
                    // 1. sendTelemetryErrorEvent(errorEventName, props) - from Logger
                    // 2. sendTelemetryErrorEvent(error, properties, measurements) - standard pattern
                    if (typeof errorOrEventName === 'string') {
                        // Logger calling pattern
                        telemetryEvents.push({ eventName: errorOrEventName, properties: properties || {}, measurements: measurements || {} });
                    }
                    else {
                        // Standard pattern
                        telemetryEvents.push({ eventName: 'extension/error', properties: properties || {}, measurements: measurements || {} });
                    }
                },
            };
        });

        it('should handle successful operation and set result to Succeeded', async () => {
            let actionExecuted = false;

            await doCancelableActionWithErrorHandling(
                'test-operation',
                'test/event',
                logger,
                mockTelemetryService,
                async () => {
                    actionExecuted = true;
                }
            );

            assert(actionExecuted, 'Expected action to be executed');

            // Verify telemetry was sent with correct result
            assert(telemetryEvents.length === 1, `Expected 1 telemetry event, got ${telemetryEvents.length}`);
            const event = telemetryEvents[0];
            assert(event.eventName === 'test/event', `Expected event name 'test/event', got '${event.eventName}'`);
            assert(event.properties.result === 'Succeeded', `Expected result 'Succeeded', got '${event.properties.result}'`);
        });

        it('should handle canceled operation with ICanceledError and set result to Canceled', async () => {
            const canceledError = new UserCancelledError('validation', 'User canceled operation');

            // This should not throw - cancellation should be handled gracefully
            await doCancelableActionWithErrorHandling(
                'test-operation',
                'test/event',
                logger,
                mockTelemetryService,
                async () => {
                    throw canceledError;
                }
            );

            // Test passed if no exception was thrown
            assert(true, 'Canceled operation should be handled gracefully');

            // Verify telemetry was sent with correct result and lastStep
            assert(telemetryEvents.length === 1, `Expected 1 telemetry event, got ${telemetryEvents.length}`);
            const event = telemetryEvents[0];
            assert(event.eventName === 'test/event', `Expected event name 'test/event', got '${event.eventName}'`);
            assert(event.properties.result === 'Canceled', `Expected result 'Canceled', got '${event.properties.result}'`);
            assert(event.properties.lastStep === 'validation', `Expected lastStep 'validation', got '${event.properties.lastStep}'`);
        });

        it('should handle canceled operation without stepName and set result to Canceled', async () => {
            const canceledError = new UserCancelledError(undefined, 'User canceled operation');

            // This should not throw - cancellation should be handled gracefully
            await doCancelableActionWithErrorHandling(
                'test-operation',
                'test/event',
                logger,
                mockTelemetryService,
                async () => {
                    throw canceledError;
                }
            );

            // Test passed if no exception was thrown
            assert(true, 'Canceled operation without stepName should be handled gracefully');

            // Verify telemetry was sent with correct result and no lastStep
            assert(telemetryEvents.length === 1, `Expected 1 telemetry event, got ${telemetryEvents.length}`);
            const event = telemetryEvents[0];
            assert(event.eventName === 'test/event', `Expected event name 'test/event', got '${event.eventName}'`);
            assert(event.properties.result === 'Canceled', `Expected result 'Canceled', got '${event.properties.result}'`);
            assert(event.properties.lastStep === undefined, `Expected lastStep to be undefined, got '${event.properties.lastStep}'`);
        });

        it('should handle FabricError correctly and set result to Failed', async () => {
            const dialogStub = sinon.stub(vscode.window, 'showErrorMessage').returns(Promise.resolve('OK'));

            try {
                const fabricError = new FabricError(
                    'Something went wrong',
                    'operation-failed',
                    { showInUserNotification: 'Error' }
                );

                await doCancelableActionWithErrorHandling(
                    'test-operation',
                    'test/event',
                    logger,
                    mockTelemetryService,
                    async () => {
                        throw fabricError;
                    }
                );

                // Check that FabricError was processed
                assert(fabricError.didProcessFabricError, 'Expected FabricError to be processed');

                // Check that error notification was shown
                assert(dialogStub.calledOnce, 'Expected showErrorMessage to be called once');

                // Check that error was logged
                assert(logger.logMessagesArray.some(log => log.includes('Something went wrong')),
                    'Expected error message to be logged');

                // Verify telemetry was sent with Failed result
                assert(telemetryEvents.length === 2, `Expected 2 telemetry events, got ${telemetryEvents.length}`);
                const activityEvent = telemetryEvents.find(e => e.eventName === 'test/event');
                assert(activityEvent, 'Expected to find TelemetryActivity event');
                assert(activityEvent.properties.result === 'Failed', `Expected result 'Failed', got '${activityEvent.properties.result}'`);

                // Verify the second telemetry event is from withErrorHandling for FabricError
                const fabricErrorEvent = telemetryEvents.find(e => e.eventName === 'unhandled/fabricerror');
                assert(fabricErrorEvent, 'Expected to find withErrorHandling FabricError telemetry event');
                assert(fabricErrorEvent.properties.fault === 'Something went wrong', `Expected fault 'Something went wrong', got '${fabricErrorEvent.properties.fault}'`);

            }
            finally {
                dialogStub.restore();
            }
        });

        it('should handle regular Error and set result to Failed', async () => {
            const regularError = new Error('Regular error occurred');

            await doCancelableActionWithErrorHandling(
                'test-operation',
                'test/event',
                logger,
                mockTelemetryService,
                async () => {
                    throw regularError;
                }
            );

            // Check that the error was logged through withErrorHandling
            const errorInLogs = logger.logMessagesArray.some(log =>
                log.includes('Regular error occurred')
            );
            assert(errorInLogs, 'Expected regular error to be logged');

            // Verify telemetry was sent with Failed result
            assert(telemetryEvents.length === 2, `Expected 2 telemetry events, got ${telemetryEvents.length}`);
            const activityEvent = telemetryEvents.find(e => e.eventName === 'test/event');
            assert(activityEvent, 'Expected to find TelemetryActivity event');
            assert(activityEvent.properties.result === 'Failed', `Expected result 'Failed', got '${activityEvent.properties.result}'`);

            // Verify the second telemetry event is from withErrorHandling for regular Error
            const regularErrorEvent = telemetryEvents.find(e => e.eventName === 'unhandled/error');
            assert(regularErrorEvent, 'Expected to find withErrorHandling regular Error telemetry event');
            assert(regularErrorEvent.properties.fault === 'Regular error occurred', `Expected fault 'Regular error occurred', got '${regularErrorEvent.properties.fault}'`);
        });
    });
});
