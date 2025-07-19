import { Content } from '../../models/content';
import { DataSource, DataSourceConfig, DataSourceHealth } from '../../models/dataSource';
import { ConnectionError, DataSourceError, TimeoutError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface SyncResult {
    success: boolean;
    documentsProcessed: number;
    documentsAdded: number;
    documentsUpdated: number;
    documentsDeleted: number;
    errors: string[];
    duration: number;
}

export interface ConnectorMetrics {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
    lastQueryTime?: Date;
}

export interface RetryOptions {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

/**
 * Abstract base class for all data source connectors
 * Provides common functionality for connection management, health checks, and error handling
 */
export abstract class DataSourceConnector {
    protected readonly dataSource: DataSource;
    protected readonly config: DataSourceConfig;
    protected isConnected: boolean = false;
    protected lastHealthCheck?: Date;
    protected metrics: ConnectorMetrics;
    protected retryOptions: RetryOptions;

    constructor(dataSource: DataSource) {
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

    /**
     * Abstract method to establish connection to the data source
     * Must be implemented by concrete connector classes
     */
    public abstract connect(): Promise<void>;

    /**
     * Abstract method to close connection to the data source
     * Must be implemented by concrete connector classes
     */
    public abstract disconnect(): Promise<void>;

    /**
     * Abstract method to validate the connection configuration
     * Must be implemented by concrete connector classes
     */
    public abstract validateConnection(): Promise<boolean>;

    /**
     * Abstract method to sync data from the source
     * Must be implemented by concrete connector classes
     */
    public abstract sync(incremental?: boolean): Promise<SyncResult>;

    /**
     * Abstract method to get content from the data source
     * Must be implemented by concrete connector classes
     */
    public abstract getContent(lastSync?: Date): Promise<Content[]>;

    /**
     * Perform health check on the data source
     * Returns health status with response time and error information
     */
    public async healthCheck(): Promise<DataSourceHealth> {
        const startTime = Date.now();
        const health: DataSourceHealth = {
            sourceId: this.dataSource.id,
            isHealthy: false,
            lastCheck: new Date(),
            errorCount: 0
        };

        try {
            const isValid = await this.executeWithRetry(
                () => this.validateConnection(),
                { maxAttempts: 1, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1 }
            );

            health.isHealthy = isValid;
            health.responseTime = Date.now() - startTime;
            this.lastHealthCheck = health.lastCheck;

            logger.debug(`Health check completed for data source ${this.dataSource.id}`, {
                sourceId: this.dataSource.id,
                isHealthy: health.isHealthy,
                responseTime: health.responseTime
            });

        } catch (error) {
            health.isHealthy = false;
            health.responseTime = Date.now() - startTime;
            health.errorCount = 1;
            health.lastError = error instanceof Error ? error.message : 'Unknown error';

            logger.error(`Health check failed for data source ${this.dataSource.id}`, {
                sourceId: this.dataSource.id,
                error: health.lastError,
                responseTime: health.responseTime
            });
        }

        return health;
    }

    /**
     * Execute an operation with retry logic
     * Implements exponential backoff with jitter
     */
    protected async executeWithRetry<T>(
        operation: () => Promise<T>,
        options?: Partial<RetryOptions>
    ): Promise<T> {
        const retryConfig = { ...this.retryOptions, ...options };
        let lastError: Error = new Error('Unknown error');
        let attempt = 0;

        while (attempt < retryConfig.maxAttempts) {
            try {
                const startTime = Date.now();
                const result = await this.executeWithTimeout(operation);

                // Update metrics on success
                this.updateMetrics(true, Date.now() - startTime);

                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempt++;

                // Update metrics on failure
                this.updateMetrics(false, 0);

                // Don't retry if it's not a retryable error
                if (error instanceof DataSourceError && !error.retryable) {
                    throw error;
                }

                // Don't retry on the last attempt
                if (attempt >= retryConfig.maxAttempts) {
                    break;
                }

                // Calculate delay with exponential backoff and jitter
                const baseDelay = Math.min(
                    retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
                    retryConfig.maxDelay
                );
                const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
                const delay = baseDelay + jitter;

                logger.warn(`Retrying operation for data source ${this.dataSource.id}`, {
                    sourceId: this.dataSource.id,
                    attempt,
                    maxAttempts: retryConfig.maxAttempts,
                    delay,
                    error: lastError.message
                });

                await this.sleep(delay);
            }
        }

        throw new DataSourceError(
            `Operation failed after ${retryConfig.maxAttempts} attempts: ${lastError.message}`,
            'MAX_RETRIES_EXCEEDED',
            this.dataSource.id,
            false
        );
    }

    /**
     * Execute operation with timeout
     */
    protected async executeWithTimeout<T>(
        operation: () => Promise<T>,
        timeoutMs?: number
    ): Promise<T> {
        const timeout = timeoutMs || this.config.timeout || 30000;

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new TimeoutError(
                    `Operation timed out after ${timeout}ms`,
                    this.dataSource.id
                ));
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

    /**
     * Update connector metrics
     */
    protected updateMetrics(success: boolean, responseTime: number): void {
        this.metrics.totalQueries++;
        this.metrics.lastQueryTime = new Date();

        if (success) {
            this.metrics.successfulQueries++;
            // Update average response time using exponential moving average
            const alpha = 0.1; // Smoothing factor
            this.metrics.averageResponseTime =
                this.metrics.averageResponseTime * (1 - alpha) + responseTime * alpha;
        } else {
            this.metrics.failedQueries++;
        }
    }

    /**
     * Get connector metrics
     */
    public getMetrics(): ConnectorMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset connector metrics
     */
    public resetMetrics(): void {
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Check if connector is connected
     */
    public getConnectionStatus(): boolean {
        return this.isConnected;
    }

    /**
     * Get data source information
     */
    public getDataSource(): DataSource {
        return { ...this.dataSource };
    }

    /**
     * Get last health check time
     */
    public getLastHealthCheck(): Date | undefined {
        return this.lastHealthCheck;
    }

    /**
     * Validate configuration before connecting
     */
    protected validateConfig(): void {
        if (!this.config) {
            throw new DataSourceError(
                'Data source configuration is required',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        // Validate timeout
        if (this.config.timeout && (this.config.timeout < 1000 || this.config.timeout > 300000)) {
            throw new DataSourceError(
                'Timeout must be between 1000ms and 300000ms',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        // Validate retry attempts
        if (this.config.retryAttempts && (this.config.retryAttempts < 0 || this.config.retryAttempts > 10)) {
            throw new DataSourceError(
                'Retry attempts must be between 0 and 10',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        // Validate batch size
        if (this.config.batchSize && (this.config.batchSize < 1 || this.config.batchSize > 10000)) {
            throw new DataSourceError(
                'Batch size must be between 1 and 10000',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }
    }

    /**
     * Sleep utility for retry delays
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log operation with context
     */
    protected logOperation(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: object): void {
        const logContext = {
            sourceId: this.dataSource.id,
            sourceName: this.dataSource.name,
            sourceType: this.dataSource.type,
            ...context
        };

        logger[level](message, logContext);
    }

    /**
     * Handle errors consistently across connectors
     */
    protected handleError(error: unknown, operation: string): never {
        let dataSourceError: DataSourceError;

        if (error instanceof DataSourceError) {
            dataSourceError = error;
        } else if (error instanceof Error) {
            // Map common error types to DataSourceError
            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                dataSourceError = new TimeoutError(error.message, this.dataSource.id);
            } else if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
                dataSourceError = new ConnectionError(error.message, this.dataSource.id);
            } else {
                dataSourceError = new DataSourceError(
                    error.message,
                    'UNKNOWN_ERROR',
                    this.dataSource.id,
                    true
                );
            }
        } else {
            dataSourceError = new DataSourceError(
                `Unknown error during ${operation}: ${String(error)}`,
                'UNKNOWN_ERROR',
                this.dataSource.id,
                true
            );
        }

        this.logOperation('error', `Error during ${operation}`, {
            error: dataSourceError.message,
            code: dataSourceError.code,
            retryable: dataSourceError.retryable
        });

        throw dataSourceError;
    }
}
