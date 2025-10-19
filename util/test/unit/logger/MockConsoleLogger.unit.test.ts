// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { MockConsoleLogger } from '../../../src/logger/MockConsoleLogger';
import { LogImportance } from '../../../src/logger/Logger';

const LOG_LEVEL_ENV_VAR = 'FABRIC_MOCK_CONSOLE_LOG_LEVEL';

describe('MockConsoleLogger', () => {
    let logger: MockConsoleLogger;
    let consoleOutput: string[];
    let savedEnv: string | undefined;

    beforeEach(() => {
        savedEnv = process.env[LOG_LEVEL_ENV_VAR];
        delete process.env[LOG_LEVEL_ENV_VAR];
        consoleOutput = [];
        logger = new MockConsoleLogger('Test Logger', {
            consoleWriter: message => consoleOutput.push(message),
        });
    });

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env[LOG_LEVEL_ENV_VAR];
        }
        else {
            process.env[LOG_LEVEL_ENV_VAR] = savedEnv;
        }
        logger.resetMessageArray();
    });

    describe('trace()', () => {
        it('should capture trace messages in logMessagesArray', () => {
            logger.trace('Trace message');

            assert.strictEqual(logger.logMessagesArray.length, 1, 'Expected one message to be captured');
            assert.ok(
                logger.logMessagesArray[0].includes('Trace message'),
                'Expected message to contain "Trace message"'
            );
        });

        it('should include timestamp prefix in captured message', () => {
            logger.trace('Test');

            assert.ok(
                logger.logMessagesArray[0].includes('MockConsoleLogger:'),
                'Expected MockConsoleLogger prefix'
            );
            assert.ok(
                /\d{2}:\d{2}:\d{2}/.test(logger.logMessagesArray[0]),
                'Expected timestamp format HH:mm:ss'
            );
        });
    });

    describe('debug()', () => {
        it('should capture debug messages in logMessagesArray', () => {
            logger.debug('Debug message');

            assert.strictEqual(logger.logMessagesArray.length, 1);
            assert.ok(logger.logMessagesArray[0].includes('Debug message'));
        });
    });

    describe('info()', () => {
        it('should capture info messages in logMessagesArray', () => {
            logger.info('Info message');

            assert.strictEqual(logger.logMessagesArray.length, 1);
            assert.ok(logger.logMessagesArray[0].includes('Info message'));
        });
    });

    describe('warn()', () => {
        it('should capture warn messages in logMessagesArray', () => {
            logger.warn('Warning message');

            assert.strictEqual(logger.logMessagesArray.length, 1);
            assert.ok(logger.logMessagesArray[0].includes('Warning message'));
        });
    });

    describe('error()', () => {
        it('should capture error messages in logMessagesArray', () => {
            logger.error('Error message');

            assert.strictEqual(logger.logMessagesArray.length, 1);
            assert.ok(logger.logMessagesArray[0].includes('Error message'));
        });
    });

    describe('resetMessageArray()', () => {
        it('should clear all captured messages', () => {
            logger.info('Message 1');
            logger.warn('Message 2');
            logger.error('Message 3');

            assert.strictEqual(logger.logMessagesArray.length, 3);

            logger.resetMessageArray();

            assert.strictEqual(logger.logMessagesArray.length, 0, 'Expected array to be empty after reset');
        });
    });

    describe('multiple messages', () => {
        it('should capture all messages in order', () => {
            logger.trace('First');
            logger.debug('Second');
            logger.info('Third');
            logger.warn('Fourth');
            logger.error('Fifth');

            assert.strictEqual(logger.logMessagesArray.length, 5);
            assert.ok(logger.logMessagesArray[0].includes('First'));
            assert.ok(logger.logMessagesArray[1].includes('Second'));
            assert.ok(logger.logMessagesArray[2].includes('Third'));
            assert.ok(logger.logMessagesArray[3].includes('Fourth'));
            assert.ok(logger.logMessagesArray[4].includes('Fifth'));
        });
    });

    describe('console log threshold', () => {
        it('should not write trace messages to console when threshold is warn', () => {
            logger.trace('Trace message');

            assert.strictEqual(consoleOutput.length, 0, 'Trace should not be written to console');
        });

        it('should write warn messages to console by default', () => {
            consoleOutput = [];
            logger.warn('Warning message');

            assert.strictEqual(consoleOutput.length, 1, 'Warn should be written to console');
            assert.ok(consoleOutput[0].includes('Warning message'));
        });

        it('should respect custom console log level', () => {
            const customLogger = new MockConsoleLogger('Custom Logger', {
                consoleLogLevel: 'debug',
                consoleWriter: message => consoleOutput.push(message),
            });
            consoleOutput = [];

            customLogger.debug('Debug message');

            assert.strictEqual(consoleOutput.length, 1, 'Debug should be written to console when threshold lowered');
            assert.ok(consoleOutput[0].includes('Debug message'));
        });
    });

    describe('environment-configured console log level', () => {
        it('should use environment variable when options do not set a level', () => {
            process.env[LOG_LEVEL_ENV_VAR] = 'info';
            const envLogger = new MockConsoleLogger('Env Logger', {
                consoleWriter: message => consoleOutput.push(message),
            });

            envLogger.info('Info message');
            assert.strictEqual(consoleOutput.length, 1, 'Info should be written when env sets info level');

            consoleOutput = [];
            envLogger.debug('Debug message');
            assert.strictEqual(consoleOutput.length, 0, 'Debug should not be written when level is info');
        });

        it('should fall back to warn when environment variable is invalid', () => {
            process.env[LOG_LEVEL_ENV_VAR] = 'verbose';
            const envLogger = new MockConsoleLogger('Env Logger', {
                consoleWriter: message => consoleOutput.push(message),
            });

            envLogger.info('Info message');
            assert.strictEqual(consoleOutput.length, 0, 'Invalid env should fall back to warn');

            envLogger.warn('Warn message');
            assert.strictEqual(consoleOutput.length, 1, 'Warn should still be written after fallback');
        });

        it('should disable console logging when environment variable is off', () => {
            process.env[LOG_LEVEL_ENV_VAR] = 'off';
            const envLogger = new MockConsoleLogger('Env Logger', {
                consoleWriter: message => consoleOutput.push(message),
            });

            envLogger.error('Error message');
            assert.strictEqual(consoleOutput.length, 0, 'No console output expected when level is off');
        });
    });

    describe('deprecated log() method', () => {
        it('should capture messages via deprecated log method', () => {
            logger.log('Old style log', LogImportance.normal);

            assert.strictEqual(logger.logMessagesArray.length, 1);
            assert.ok(logger.logMessagesArray[0].includes('Old style log'));
        });
    });

    describe('deprecated reportExceptionTelemetryAndLog()', () => {
        it('should capture exception messages', () => {
            const error = new Error('Test error');

            logger.reportExceptionTelemetryAndLog(
                'testMethod',
                'test-event',
                error,
                null,
                { customProp: 'value' }
            );

            assert.ok(logger.logMessagesArray.length >= 1, 'Expected at least one log message');
            const errorMessage = logger.logMessagesArray.find(msg =>
                msg.includes('Test error') || msg.includes('testMethod')
            );
            assert.ok(errorMessage, 'Expected error message to be captured');
            assert.ok(consoleOutput.some(msg => msg.includes('Test error')), 'Expected error to be written to console');
        });
    });
});
