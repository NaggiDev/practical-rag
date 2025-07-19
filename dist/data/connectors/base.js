"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourceConnector = void 0;
const errors_1 = require("../../utils/errors");
const logger_1 = require("../../utils/logger");
class DataSourceConnector {
    constructor(dataSource) {
        this.isConnected = false;
        this.dataSource = dataSource;
        this.config = dataSource.config;
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageResponseTime: 0
        };
        this.retryOptions = {
            maxAttempts: this.config.retryAttempts || 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2
        };
    }
    async healthCheck() {
        const startTime = Date.now();
        const health = {
            sourceId: this.dataSource.id,
            isHealthy: false,
            lastCheck: new Date(),
            errorCount: 0
        };
        try {
            const isValid = await this.executeWithRetry(() => this.validateConnection(), { maxAttempts: 1, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1 });
            health.isHealthy = isValid;
            health.responseTime = Date.now() - startTime;
            this.lastHealthCheck = health.lastCheck;
            logger_1.logger.debug(`Health check completed for data source ${this.dataSource.id}`, {
                sourceId: this.dataSource.id,
                isHealthy: health.isHealthy,
                responseTime: health.responseTime
            });
        }
        catch (error) {
            health.isHealthy = false;
            health.responseTime = Date.now() - startTime;
            health.errorCount = 1;
            health.lastError = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Health check failed for data source ${this.dataSource.id}`, {
                sourceId: this.dataSource.id,
                error: health.lastError,
                responseTime: health.responseTime
            });
        }
        return health;
    }
    async executeWithRetry(operation, options) {
        const retryConfig = { ...this.retryOptions, ...options };
        let lastError = new Error('Unknown error');
        let attempt = 0;
        while (attempt < retryConfig.maxAttempts) {
            try {
                const startTime = Date.now();
                const result = await this.executeWithTimeout(operation);
                this.updateMetrics(true, Date.now() - startTime);
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempt++;
                this.updateMetrics(false, 0);
                if (error instanceof errors_1.DataSourceError && !error.retryable) {
                    throw error;
                }
                if (attempt >= retryConfig.maxAttempts) {
                    break;
                }
                const baseDelay = Math.min(retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1), retryConfig.maxDelay);
                const jitter = Math.random() * 0.1 * baseDelay;
                const delay = baseDelay + jitter;
                logger_1.logger.warn(`Retrying operation for data source ${this.dataSource.id}`, {
                    sourceId: this.dataSource.id,
                    attempt,
                    maxAttempts: retryConfig.maxAttempts,
                    delay,
                    error: lastError.message
                });
                await this.sleep(delay);
            }
        }
        throw new errors_1.DataSourceError(`Operation failed after ${retryConfig.maxAttempts} attempts: ${lastError.message}`, 'MAX_RETRIES_EXCEEDED', this.dataSource.id, false);
    }
    async executeWithTimeout(operation, timeoutMs) {
        const timeout = timeoutMs || this.config.timeout || 30000;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new errors_1.TimeoutError(`Operation timed out after ${timeout}ms`, this.dataSource.id));
            }, timeout);
            operation()
                .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    updateMetrics(success, responseTime) {
        this.metrics.totalQueries++;
        this.metrics.lastQueryTime = new Date();
        if (success) {
            this.metrics.successfulQueries++;
            const alpha = 0.1;
            this.metrics.averageResponseTime =
                this.metrics.averageResponseTime * (1 - alpha) + responseTime * alpha;
        }
        else {
            this.metrics.failedQueries++;
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageResponseTime: 0
        };
    }
    getConnectionStatus() {
        return this.isConnected;
    }
    getDataSource() {
        return { ...this.dataSource };
    }
    getLastHealthCheck() {
        return this.lastHealthCheck;
    }
    validateConfig() {
        if (!this.config) {
            throw new errors_1.DataSourceError('Data source configuration is required', 'INVALID_CONFIG', this.dataSource.id);
        }
        if (this.config.timeout && (this.config.timeout < 1000 || this.config.timeout > 300000)) {
            throw new errors_1.DataSourceError('Timeout must be between 1000ms and 300000ms', 'INVALID_CONFIG', this.dataSource.id);
        }
        if (this.config.retryAttempts && (this.config.retryAttempts < 0 || this.config.retryAttempts > 10)) {
            throw new errors_1.DataSourceError('Retry attempts must be between 0 and 10', 'INVALID_CONFIG', this.dataSource.id);
        }
        if (this.config.batchSize && (this.config.batchSize < 1 || this.config.batchSize > 10000)) {
            throw new errors_1.DataSourceError('Batch size must be between 1 and 10000', 'INVALID_CONFIG', this.dataSource.id);
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    logOperation(level, message, context) {
        const logContext = {
            sourceId: this.dataSource.id,
            sourceName: this.dataSource.name,
            sourceType: this.dataSource.type,
            ...context
        };
        logger_1.logger[level](message, logContext);
    }
    handleError(error, operation) {
        let dataSourceError;
        if (error instanceof errors_1.DataSourceError) {
            dataSourceError = error;
        }
        else if (error instanceof Error) {
            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                dataSourceError = new errors_1.TimeoutError(error.message, this.dataSource.id);
            }
            else if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
                dataSourceError = new errors_1.ConnectionError(error.message, this.dataSource.id);
            }
            else {
                dataSourceError = new errors_1.DataSourceError(error.message, 'UNKNOWN_ERROR', this.dataSource.id, true);
            }
        }
        else {
            dataSourceError = new errors_1.DataSourceError(`Unknown error during ${operation}: ${String(error)}`, 'UNKNOWN_ERROR', this.dataSource.id, true);
        }
        this.logOperation('error', `Error during ${operation}`, {
            error: dataSourceError.message,
            code: dataSourceError.code,
            retryable: dataSourceError.retryable
        });
        throw dataSourceError;
    }
}
exports.DataSourceConnector = DataSourceConnector;
//# sourceMappingURL=base.js.map