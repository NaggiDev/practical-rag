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
declare class StructuredLogger implements Logger {
    private winston;
    private correlationId;
    private serviceName;
    private errorTracker;
    private diagnosticEntries;
    private maxDiagnosticEntries;
    constructor(serviceName?: string);
    private enrichContext;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    child(context: LogContext): Logger;
    setCorrelationId(correlationId: string): void;
    getCorrelationId(): string;
    private trackError;
    collectDiagnosticInfo(operation: string, duration: number, success: boolean, context?: LogContext, errorCode?: string): void;
    getErrorSummary(): {
        [category: string]: {
            count: number;
            errors: ErrorTrackingEntry[];
        };
    };
    getFrequentErrors(limit?: number): ErrorTrackingEntry[];
    getRecentErrors(minutes?: number): ErrorTrackingEntry[];
    getDiagnosticInfo(operation?: string, limit?: number): DiagnosticInfo[];
    getOperationStats(operation: string): {
        totalCount: number;
        successCount: number;
        failureCount: number;
        averageDuration: number;
        successRate: number;
    };
    cleanup(retentionHours?: number): void;
}
export declare const logger: Logger;
export { StructuredLogger };
//# sourceMappingURL=logger.d.ts.map