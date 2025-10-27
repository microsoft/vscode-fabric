// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LogOutputChannel } from 'vscode';
import { Logger, LogImportance } from './Logger';
import { TelemetryService } from '../telemetry/TelemetryService';

export type MockConsoleLoggerLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off';

export interface MockConsoleLoggerOptions {
    /** Minimum severity that will be written to the console writer. Defaults to 'warn'. */
    consoleLogLevel?: MockConsoleLoggerLevel;
    /** Optional override for console logging (defaults to console.log). */
    consoleWriter?: (message: string) => void;
}

const LOG_LEVEL: Record<MockConsoleLoggerLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    off: Number.POSITIVE_INFINITY,
};

const CONSOLE_LOG_LEVEL_ENV_KEY = 'FABRIC_MOCK_CONSOLE_LOG_LEVEL';

/**
 * MockConsoleLogger extends Logger and captures all log messages for test assertions.
 *
 * This logger writes to both console.log and an internal array for test verification.
 */
export class MockConsoleLogger extends Logger {
    public logMessagesArray: string[] = [];
    private readonly consoleLogLevel: MockConsoleLoggerLevel;
    private readonly consoleWriter: (message: string) => void;

    constructor(logNameOrOutputChannel: string | LogOutputChannel, options?: MockConsoleLoggerOptions) {
        super(logNameOrOutputChannel);
        this.consoleLogLevel = resolveConsoleLogLevel(options?.consoleLogLevel);
        this.consoleWriter = options?.consoleWriter ?? ((message: string) => console.log(message));
    }

    private captureMessage(level: MockConsoleLoggerLevel, message: string): string {
        const dt = new Date();
        const formattedMessage = `MockConsoleLogger: ${padTo2Digits(dt.getHours())}:${padTo2Digits(dt.getMinutes())}:${padTo2Digits(dt.getSeconds())} ${message}`;
        if (this.shouldLogToConsole(level)) {
            this.consoleWriter(formattedMessage);
        }
        this.logMessagesArray.push(formattedMessage);
        return formattedMessage;
    }

    private shouldLogToConsole(level: MockConsoleLoggerLevel): boolean {
        return LOG_LEVEL[level] >= LOG_LEVEL[this.consoleLogLevel];
    }

    trace(message: string, show?: boolean): void {
        const formatted = this.captureMessage('trace', message);
        super.trace(formatted, show);
    }

    debug(message: string, show?: boolean): void {
        const formatted = this.captureMessage('debug', message);
        super.debug(formatted, show);
    }

    info(message: string, show?: boolean): void {
        const formatted = this.captureMessage('info', message);
        super.info(formatted, show);
    }

    warn(message: string, show?: boolean): void {
        const formatted = this.captureMessage('warn', message);
        super.warn(formatted, show);
    }

    error(message: string, show?: boolean): void {
        const formatted = this.captureMessage('error', message);
        super.error(formatted, show);
    }

    /** @deprecated Use trace(), debug(), info(), warn(), or error() instead. */
    log(message: string | undefined, importance?: LogImportance | undefined, show?: boolean | undefined): void {
        // Don't use captureMessage here because super.log() will delegate to one of the new methods
        // (trace/debug/info/warn/error) which will capture the message, avoiding double-capture
        super.log(message ?? '', importance, show);
    }

    /** @deprecated Separate telemetry from logging. */
    reportExceptionTelemetryAndLog(
        methodName: string,
        eventName: string,
        exception: unknown,
        telemetryService: TelemetryService | null,
        properties?: { [key: string]: string } | undefined
    ): void {
        let faultMessage: string | null = null;
        if (properties?.fault) {
            faultMessage = properties.fault;
            delete properties.fault;
        }
        else if (exception instanceof Error) {
            faultMessage = exception.message;
        }
        const msg = faultMessage ?? ((exception as string)) ?? 'Unknown error';

        if (this.shouldLogToConsole('error')) {
            this.consoleWriter(msg);
        }
        this.logMessagesArray.push(msg);

        super.reportExceptionTelemetryAndLog(methodName, eventName, exception, telemetryService, properties);
    }

    show(): void {
        // do nothing - don't show output in tests
    }

    resetMessageArray(): void {
        this.logMessagesArray = [];
    }
}

function padTo2Digits(num: number): string {
    return num.toString().padStart(2, '0');
}

function resolveConsoleLogLevel(optionLevel?: MockConsoleLoggerLevel): MockConsoleLoggerLevel {
    if (optionLevel) {
        return optionLevel;
    }

    const envLevel = process.env[CONSOLE_LOG_LEVEL_ENV_KEY]?.trim().toLowerCase();
    if (envLevel && isMockConsoleLoggerLevel(envLevel)) {
        return envLevel;
    }

    return 'warn';
}

function isMockConsoleLoggerLevel(value: string): value is MockConsoleLoggerLevel {
    return value === 'trace'
        || value === 'debug'
        || value === 'info'
        || value === 'warn'
        || value === 'error'
        || value === 'off';
}
