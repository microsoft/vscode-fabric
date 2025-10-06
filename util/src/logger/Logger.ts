// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LogOutputChannel, window } from 'vscode';
import { TelemetryService } from '../telemetry/TelemetryService';

// export type WatchOptions = {
//     importance?: LogImportance
//     telemetry?: TelemetryEvent<keyof TelemetryEventNames>
//     catchUnhandledErrors?: boolean
// };

export enum LogImportance {
    low,
    normal,
    high,
}

export interface ILogger {
    /**
     * Log a trace message (most verbose level)
     * @param message - The message to log
     * @param show - Optional: whether to show the output pane
     */
    trace(message: string, show?: boolean): void;

    /**
     * Log a debug message
     * @param message - The message to log
     * @param show - Optional: whether to show the output pane
     */
    debug(message: string, show?: boolean): void;

    /**
     * Log an informational message
     * @param message - The message to log
     * @param show - Optional: whether to show the output pane
     */
    info(message: string, show?: boolean): void;

    /**
     * Log a warning message
     * @param message - The message to log
     * @param show - Optional: whether to show the output pane
     */
    warn(message: string, show?: boolean): void;

    /**
     * Log an error message
     * @param message - The message to log
     * @param show - Optional: whether to show the output pane
     */
    error(message: string, show?: boolean): void;

    /**
     * Show the output channel without logging
     */
    show(): void;

    /**
     * @deprecated Use trace(), debug(), info(), warn(), or error() instead.
     * This method will be removed in v2.0.0.
     *
     * Migration guide:
     * - LogImportance.low → debug()
     * - LogImportance.normal → info()
     * - LogImportance.high → warn()
     * - Remove 'show' parameter; call show() explicitly if needed or pass to new methods
     */
    log(message: string, importance?: LogImportance, show?: boolean): void;

    /**
     * @deprecated Separate telemetry from logging. Use TelemetryService for telemetry and error() for logging.
     * This method will be removed in v2.0.0.
     *
     * Migration: Handle telemetry in calling code; use error() for logging exceptions.
     */
    reportExceptionTelemetryAndLog(
        methodName: string,
        eventName: string,
        exception: unknown,
        telemetryService: any | null,
        properties?: { [key: string]: string } | undefined,
    ): void;
}

export class Logger implements ILogger {
    private readonly outputChannel: LogOutputChannel;

    constructor(logNameOrOutputChannel: string | LogOutputChannel) {
        this.outputChannel = typeof logNameOrOutputChannel === 'string' ? window.createOutputChannel(logNameOrOutputChannel, { log: true }) : logNameOrOutputChannel;
    }

    trace(message: string, show?: boolean): void {
        if (show) {
            this.outputChannel.show();
        }
        this.outputChannel.trace(message);
    }

    debug(message: string, show?: boolean): void {
        if (show) {
            this.outputChannel.show();
        }
        this.outputChannel.debug(message);
    }

    info(message: string, show?: boolean): void {
        if (show) {
            this.outputChannel.show();
        }
        this.outputChannel.info(message);
    }

    warn(message: string, show?: boolean): void {
        if (show) {
            this.outputChannel.show();
        }
        this.outputChannel.warn(message);
    }

    error(message: string, show?: boolean): void {
        if (show) {
            this.outputChannel.show();
        }
        this.outputChannel.error(message);
    }

    show(): void {
        this.outputChannel.show();
    }

    /** @deprecated Use trace(), debug(), info(), warn(), or error() instead. */
    log(message: string, importance?: LogImportance, show?: boolean): void {
        const logFn = importance === LogImportance.high ? this.warn.bind(this)
            : importance === LogImportance.low ? this.debug.bind(this)
                : this.info.bind(this);
        logFn(message, show);
    }

    /** @deprecated Separate telemetry from logging. Use TelemetryService for telemetry and error() for logging. */
    reportExceptionTelemetryAndLog(
        methodName: string, //method or operation name
        errorEventName: string,
        exception: unknown,
        telemetryService: TelemetryService | null,
        properties?: { [key: string]: string } | undefined
    ): void {
        let stack: string | null = null;
        let error: Error = exception as Error;
        let fault: string | null = null;
        if (properties?.fault) {
            fault = properties.fault;
            delete properties.fault;
        }
        if (error) {
            // vscode-extension-telemetry tries to scrub all strings but errorMessages can be risky with user data.
            // To be safe, we will post stacktraces but not the message in the error for now.
            stack = error.stack ?? null;
            if (!fault) {
                fault = error.message;
            }
        }

        fault = fault ?? methodName;
        let props: { [key: string]: string } = stack ? { exceptionStack: stack } : {};
        props = { ...props, ...properties, fault: fault, errorMethodName: methodName };
        telemetryService?.sendTelemetryErrorEvent(errorEventName, props);
        this.error('Error occurred in ' + methodName + ': ' + exception);
    }
}
