"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuredLogger = exports.logger = void 0;
const uuid_1 = require("uuid");
const winston_1 = __importDefault(require("winston"));
class StructuredLogger {
    constructor(serviceName = 'fast-rag-system') {
        this.errorTracker = new Map();
        this.diagnosticEntries = [];
        this.maxDiagnosticEntries = 1000;
        this.serviceName = serviceName;
        this.correlationId = (0, uuid_1.v4)();
        this.winston = winston_1.default.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf((info) => {
                const logEntry = {
                    timestamp: String(info.timestamp),
                    level: info.level,
                    message: String(info.message),
                    correlationId: String(info.correlationId || this.correlationId),
                    service: this.serviceName,
                    context: info.context || {}
                };
                return JSON.stringify(logEntry);
            })),
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple(), winston_1.default.format.printf((info) => {
                        const correlationId = String(info.correlationId || this.correlationId);
                        const contextStr = info.context ? ` ${JSON.stringify(info.context)}` : '';
                        return `[${info.timestamp}] [${correlationId.substring(0, 8)}] ${info.level}: ${info.message}${contextStr}`;
                    }))
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/error.log',
                    level: 'error'
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/combined.log'
                })
            ]
        });
    }
    enrichContext(context = {}) {
        return {
            ...context,
            correlationId: context.correlationId || this.correlationId,
            service: this.serviceName,
            timestamp: new Date().toISOString()
        };
    }
    debug(message, context) {
        this.winston.debug(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });
    }
    info(message, context) {
        this.winston.info(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });
    }
    warn(message, context) {
        this.winston.warn(message, {
            correlationId: this.correlationId,
            context: this.enrichContext(context)
        });
        if (context?.errorCode) {
            this.trackError(context.errorCode, 'warning', message, context);
        }
    }
    error(message, context) {
        const enrichedContext = this.enrichContext(context);
        this.winston.error(message, {
            correlationId: this.correlationId,
            context: enrichedContext
        });
        const errorCode = context?.errorCode || 'UNKNOWN_ERROR';
        const errorCategory = context?.errorCategory || 'general';
        this.trackError(errorCode, errorCategory, message, enrichedContext, context?.stackTrace);
    }
    child(context) {
        const childLogger = new StructuredLogger(this.serviceName);
        childLogger.correlationId = context.correlationId || this.correlationId;
        return childLogger;
    }
    setCorrelationId(correlationId) {
        this.correlationId = correlationId;
    }
    getCorrelationId() {
        return this.correlationId;
    }
    trackError(errorCode, errorCategory, message, context, stackTrace) {
        const errorKey = `${errorCode}-${errorCategory}`;
        const now = new Date();
        if (this.errorTracker.has(errorKey)) {
            const existing = this.errorTracker.get(errorKey);
            existing.count++;
            existing.lastOccurrence = now;
            existing.context = { ...existing.context, ...context };
        }
        else {
            const entry = {
                id: (0, uuid_1.v4)(),
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
    collectDiagnosticInfo(operation, duration, success, context = {}, errorCode) {
        const diagnosticInfo = {
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
        if (this.diagnosticEntries.length > this.maxDiagnosticEntries) {
            this.diagnosticEntries = this.diagnosticEntries.slice(-this.maxDiagnosticEntries);
        }
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
    getErrorSummary() {
        const summary = {};
        for (const entry of this.errorTracker.values()) {
            if (!summary[entry.errorCategory]) {
                summary[entry.errorCategory] = { count: 0, errors: [] };
            }
            summary[entry.errorCategory].count += entry.count;
            summary[entry.errorCategory].errors.push(entry);
        }
        return summary;
    }
    getFrequentErrors(limit = 10) {
        return Array.from(this.errorTracker.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
    getRecentErrors(minutes = 60) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return Array.from(this.errorTracker.values())
            .filter(entry => entry.lastOccurrence >= cutoff)
            .sort((a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime());
    }
    getDiagnosticInfo(operation, limit = 100) {
        let entries = this.diagnosticEntries;
        if (operation) {
            entries = entries.filter(entry => entry.operation === operation);
        }
        return entries
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
    getOperationStats(operation) {
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
    cleanup(retentionHours = 24) {
        const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
        for (const [key, entry] of this.errorTracker.entries()) {
            if (entry.lastOccurrence < cutoff) {
                this.errorTracker.delete(key);
            }
        }
        this.diagnosticEntries = this.diagnosticEntries.filter(entry => entry.timestamp >= cutoff);
    }
}
exports.StructuredLogger = StructuredLogger;
exports.logger = new StructuredLogger();
//# sourceMappingURL=logger.js.map