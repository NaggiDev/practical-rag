import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    correlationId?: string;
    userId?: string;
    queryId?: string;
    sourceId?: string;
    operation?: string;
    duration?: number;
    errorCode?: string;
    errorCategory?: string;
    stackTrace?: string;
    [key: string]: any;
}

export interface StructuredLogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    correlationId: string;
    service: string;
    context: LogContext;
}

export interface Logger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    child(context: LogContext): Logger;
    setCorrelationId(correlationId: string): void;
    getCorrelationId(): string;
}

export interface ErrorTrackingEntry {
    id: string;
    timestamp: Date;
    correlationId: string;
    errorCode: string;
    errorCategory: string;
    message: string;
    stackTrace?: string;
    context: LogContext;
    count: number;
    firstOccurrence: Date;
    lastOccurrence: Date;
}

export interface DiagnosticInfo {
    timestamp: Date;
    correlationId: string;
    operation: string;
    duration: number;
    success: boolean;
    errorCode?: string;
    context: LogContext;
    systemMetrics: {
        memoryUsage: NodeJS.MemoryUsage;
        cpuUsage: NodeJS.CpuUsage;
    };
}

class StructuredLogger implements Logger {
    private winston: winston.Logger;
    private correlationId: string;
    private serviceName: string;
    private errorTracker: Map<string, ErrorTrackingEntry> = new Map();
    private diagnosticEntries: DiagnosticInfo[] = [];
    private maxDiagnosticEntries: number = 1000;

    constructor(serviceName: string = 'fast-rag-system') {
        this.serviceName = serviceName;
        this.correlationId = uuidv4();

        // Configure Winston logger
        this.winston = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json(),
                winston.format.printf((info) => {
                    const logEntry: StructuredLogEntry = {
                        timestamp: String(info.timestamp),
                        level: info.level as LogLevel,
                        message: String(info.message),
                        correlationId: String(info.correlationId || this.correlationId),
                        service: this.serviceName,
                        context: info.context || {}
                    };
                    return JSON.stringify(logEntry);
                })
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple(),
                        winston.format.printf((info) => {
                            const correlationId = String(info.correlationId || this.correlationId);
                            const contextStr = info.context ? ` ${JSON.stringify(info.context)}` : '';
                            return `[${info.timestamp}] [${correlationId.substring(0, 8)}] ${info.level}: ${info.message}${contextStr}`;
                        })
                    )
                }),
                new winston.transports.File({
                    filename: 'logs/error.log',
                    level: 'error'
                }),
                new winston.transports.File({
                    filename: 'logs/combined.log'
                })
            ]
        });
    }

    private enrichContext(context: LogContext = {}): LogContext {
        return {
            ...context,
            correlationId: context.correlationId || this.correlationId,
            service: this.serviceName,
            timestamp: new Date().toISOString()
        };
    }

    debug(message: string, context?: LogContext): void {
        this.winston.debug(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });
    }

    info(message: string, context?: LogContext): void {
        this.winston.info(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });
    }

    warn(message: string, context?: LogContext): void {
        this.winston.warn(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });

        // Track warning as potential error
        if (context?.errorCode) {
            this.trackError(context.errorCode, 'warning', message, context);
        }
    }

    error(message: string, context?: LogContext): void {
        const enrichedContext = this.enrichContext(context);

        this.winston.error(message, {
            correlationId: this.correlationId,
            context: enrichedContext
        });

        // Track error for analysis
        const errorCode = context?.errorCode || 'UNKNOWN_ERROR';
        const errorCategory = context?.errorCategory || 'general';
        this.trackError(errorCode, errorCategory, message, enrichedContext, context?.stackTrace);
    }

    child(context: LogContext): Logger {
        const childLogger = new StructuredLogger(this.serviceName);
        childLogger.correlationId = context.correlationId || this.correlationId;
        return childLogger;
    }

    setCorrelationId(correlationId: string): void {
        this.correlationId = correlationId;
    }

    getCorrelationId(): string {
        return this.correlationId;
    }

    // Error tracking functionality
    private trackError(
        errorCode: string,
        errorCategory: string,
        message: string,
        context: LogContext,
        stackTrace?: string
    ): void {
        const errorKey = `${errorCode}-${errorCategory}`;
        const now = new Date();

        if (this.errorTracker.has(errorKey)) {
            const existing = this.errorTracker.get(errorKey)!;
            existing.count++;
            existing.lastOccurrence = now;
            existing.context = { ...existing.context, ...context };
        } else {
            const entry: ErrorTrackingEntry = {
                id: uuidv4(),
                timestamp: now,
                correlationId: this.correlationId,
                errorCode,
                errorCategory,
                message,
                stackTrace,
                context,
                count: 1,
                firstOccurrence: now,
                lastOccurrence: now
            };
            this.errorTracker.set(errorKey, entry);
        }
    }

    // Diagnostic information collection
    public collectDiagnosticInfo(
        operation: string,
        duration: number,
        success: boolean,
        context: LogContext = {},
        errorCode?: string
    ): void {
        const diagnosticInfo: DiagnosticInfo = {
            timestamp: new Date(),
            correlationId: this.correlationId,
            operation,
            duration,
            success,
            errorCode,
            context: this.enrichContext(context),
            systemMetrics: {
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            }
        };

        this.diagnosticEntries.push(diagnosticInfo);

        // Keep only the most recent entries
        if (this.diagnosticEntries.length > this.maxDiagnosticEntries) {
            this.diagnosticEntries = this.diagnosticEntries.slice(-this.maxDiagnosticEntries);
        }

        // Log diagnostic info for critical operations or failures
        if (!success || duration > 5000) {
            this.warn(`Operation ${operation} completed`, {
                operation,
                duration,
                success,
                errorCode,
                ...context
            });
        }
    }

    // Error analysis methods
    public getErrorSummary(): { [category: string]: { count: number; errors: ErrorTrackingEntry[] } } {
        const summary: { [category: string]: { count: number; errors: ErrorTrackingEntry[] } } = {};

        for (const entry of this.errorTracker.values()) {
            if (!summary[entry.errorCategory]) {
                summary[entry.errorCategory] = { count: 0, errors: [] };
            }
            summary[entry.errorCategory]!.count += entry.count;
            summary[entry.errorCategory]!.errors.push(entry);
        }

        return summary;
    }

    public getFrequentErrors(limit: number = 10): ErrorTrackingEntry[] {
        return Array.from(this.errorTracker.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    public getRecentErrors(minutes: number = 60): ErrorTrackingEntry[] {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return Array.from(this.errorTracker.values())
            .filter(entry => entry.lastOccurrence >= cutoff)
            .sort((a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime());
    }

    public getDiagnosticInfo(operation?: string, limit: number = 100): DiagnosticInfo[] {
        let entries = this.diagnosticEntries;

        if (operation) {
            entries = entries.filter(entry => entry.operation === operation);
        }

        return entries
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }

    public getOperationStats(operation: string): {
        totalCount: number;
        successCount: number;
        failureCount: number;
        averageDuration: number;
        successRate: number;
    } {
        const entries = this.diagnosticEntries.filter(entry => entry.operation === operation);

        if (entries.length === 0) {
            return {
                totalCount: 0,
                successCount: 0,
                failureCount: 0,
                averageDuration: 0,
                successRate: 0
            };
        }

        const successCount = entries.filter(entry => entry.success).length;
        const failureCount = entries.length - successCount;
        const averageDuration = entries.reduce((sum, entry) => sum + entry.duration, 0) / entries.length;
        const successRate = successCount / entries.length;

        return {
            totalCount: entries.length,
            successCount,
            failureCount,
            averageDuration,
            successRate
        };
    }

    // Cleanup old entries
    public cleanup(retentionHours: number = 24): void {
        const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

        // Clean up error tracking entries
        for (const [key, entry] of this.errorTracker.entries()) {
            if (entry.lastOccurrence < cutoff) {
                this.errorTracker.delete(key);
            }
        }

        // Clean up diagnostic entries
        this.diagnosticEntries = this.diagnosticEntries.filter(
            entry => entry.timestamp >= cutoff
        );
    }
}

// Create singleton logger instance
export const logger: Logger = new StructuredLogger();

// Export the class for testing and custom instances
export { StructuredLogger };

