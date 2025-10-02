// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Mock, It } from 'moq.ts';
import { LogOutputChannel } from 'vscode';
import { Logger, LogImportance } from '../../../src/logger/Logger';

describe('Logger', () => {
    let mockOutputChannel: Mock<LogOutputChannel>;
    let logger: Logger;

    beforeEach(() => {
        mockOutputChannel = new Mock<LogOutputChannel>();
        mockOutputChannel.setup(instance => instance.trace(It.IsAny())).returns(undefined);
        mockOutputChannel.setup(instance => instance.debug(It.IsAny())).returns(undefined);
        mockOutputChannel.setup(instance => instance.info(It.IsAny())).returns(undefined);
        mockOutputChannel.setup(instance => instance.warn(It.IsAny())).returns(undefined);
        mockOutputChannel.setup(instance => instance.error(It.IsAny())).returns(undefined);
        mockOutputChannel.setup(instance => instance.show()).returns(undefined);

        logger = new Logger(mockOutputChannel.object());
    });

    describe('trace()', () => {
        it('should call outputChannel.trace with message', () => {
            const message = 'Trace message';
            logger.trace(message);

            mockOutputChannel.verify(instance => instance.trace(message));
        });

        it('should show output channel when show parameter is true', () => {
            logger.trace('Message', true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.trace('Message'));
        });

        it('should call trace without show when show parameter is false', () => {
            logger.trace('Message', false);

            mockOutputChannel.verify(instance => instance.trace('Message'));
        });

        it('should call trace without show when show parameter is omitted', () => {
            logger.trace('Message');

            mockOutputChannel.verify(instance => instance.trace('Message'));
        });
    });

    describe('debug()', () => {
        it('should call outputChannel.debug with message', () => {
            const message = 'Debug message';
            logger.debug(message);

            mockOutputChannel.verify(instance => instance.debug(message));
        });

        it('should show output channel when show parameter is true', () => {
            logger.debug('Message', true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.debug('Message'));
        });

        it('should call debug without show when show parameter is false', () => {
            logger.debug('Message', false);

            mockOutputChannel.verify(instance => instance.debug('Message'));
        });
    });

    describe('info()', () => {
        it('should call outputChannel.info with message', () => {
            const message = 'Info message';
            logger.info(message);

            mockOutputChannel.verify(instance => instance.info(message));
        });

        it('should show output channel when show parameter is true', () => {
            logger.info('Message', true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.info('Message'));
        });

        it('should call info without show when show parameter is false', () => {
            logger.info('Message', false);

            mockOutputChannel.verify(instance => instance.info('Message'));
        });
    });

    describe('warn()', () => {
        it('should call outputChannel.warn with message', () => {
            const message = 'Warning message';
            logger.warn(message);

            mockOutputChannel.verify(instance => instance.warn(message));
        });

        it('should show output channel when show parameter is true', () => {
            logger.warn('Message', true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.warn('Message'));
        });

        it('should call warn without show when show parameter is false', () => {
            logger.warn('Message', false);

            mockOutputChannel.verify(instance => instance.warn('Message'));
        });
    });

    describe('error()', () => {
        it('should call outputChannel.error with message', () => {
            const message = 'Error message';
            logger.error(message);

            mockOutputChannel.verify(instance => instance.error(message));
        });

        it('should show output channel when show parameter is true', () => {
            logger.error('Message', true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.error('Message'));
        });

        it('should call error without show when show parameter is false', () => {
            logger.error('Message', false);

            mockOutputChannel.verify(instance => instance.error('Message'));
        });
    });

    describe('show()', () => {
        it('should call outputChannel.show', () => {
            logger.show();

            mockOutputChannel.verify(instance => instance.show());
        });
    });

    describe('log() - deprecated backward compatibility', () => {
        it('should delegate to debug() when importance is low', () => {
            logger.log('Low importance message', LogImportance.low);

            mockOutputChannel.verify(instance => instance.debug('Low importance message'));
        });

        it('should delegate to info() when importance is normal', () => {
            logger.log('Normal importance message', LogImportance.normal);

            mockOutputChannel.verify(instance => instance.info('Normal importance message'));
        });

        it('should delegate to info() when importance is undefined', () => {
            logger.log('Message with no importance');

            mockOutputChannel.verify(instance => instance.info('Message with no importance'));
        });

        it('should delegate to warn() when importance is high', () => {
            logger.log('High importance message', LogImportance.high);

            mockOutputChannel.verify(instance => instance.warn('High importance message'));
        });

        it('should show output channel when show parameter is true', () => {
            logger.log('Message', LogImportance.normal, true);

            mockOutputChannel.verify(instance => instance.show());
            mockOutputChannel.verify(instance => instance.info('Message'));
        });

        it('should call info when show parameter is false', () => {
            logger.log('Message', LogImportance.normal, false);

            mockOutputChannel.verify(instance => instance.info('Message'));
        });

        it('should call info when show parameter is omitted', () => {
            logger.log('Message', LogImportance.normal);

            mockOutputChannel.verify(instance => instance.info('Message'));
        });
    });
});
