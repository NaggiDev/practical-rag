// Logger utility

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    [key: string]: any;
}

export interface Logger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
}

class ConsoleLogger implements Logger {
    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
    }

    debug(message: string, context?: LogContext): void {
        console.debug(this.formatMessage('debug', message, context));
    }

    info(message: string, context?: LogContext): void {
        console.info(this.formatMessage('info', message, context));
    }

    warn(message: string, context?: LogContext): void {
        console.warn(this.formatMessage('warn', message, context));
    }

    error(message: string, context?: LogContext): void {
        console.error(this.formatMessage('error', message, context));
    }
}

export const logger: Logger = new ConsoleLogger();
