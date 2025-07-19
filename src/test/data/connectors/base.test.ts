import { DataSourceConnector, SyncResult } from '../../../data/connectors/base';
import { Content } from '../../../models/content';
import { DataSource } from '../../../models/dataSource';
import { ConnectionError, DataSourceError, TimeoutError } from '../../../utils/errors';

// Mock concrete implementation for testing
class MockDataSourceConnector extends DataSourceConnector {
    private shouldFailConnection = false;
    private shouldFailValidation = false;
    private connectionDelay = 0;
    private validationDelay = 0;

    constructor(dataSource: DataSource) {
        super(dataSource);
    }

    public setConnectionFailure(shouldFail: boolean): void {
        this.shouldFailConnection = shouldFail;
    }

    public setValidationFailure(shouldFail: boolean): void {
        this.shouldFailValidation = shouldFail;
    }

    public setConnectionDelay(delay: number): void {
        this.connectionDelay = delay;
    }

    public setValidationDelay(delay: number): void {
        this.validationDelay = delay;
    }

    public async connect(): Promise<void> {
        if (this.connectionDelay > 0) {
            await this.sleep(this.connectionDelay);
        }

        if (this.shouldFailConnection) {
            throw new ConnectionError('Mock connection failed', this.dataSource.id);
        }

        this.isConnected = true;
    }

    public async disconnect(): Promise<void> {
        this.isConnected = false;
    }

    public async validateConnection(): Promise<boolean> {
        if (this.validationDelay > 0) {
            await this.sleep(this.validationDelay);
        }

        if (this.shouldFailValidation) {
            throw new ConnectionError('Mock validation failed', this.dataSource.id);
        }

        return this.isConnected;
    }

    public async sync(_incremental?: boolean): Promise<SyncResult> {
        return {
            success: true,
            documentsProcessed: 10,
            documentsAdded: 5,
            documentsUpdated: 3,
            documentsDeleted: 2,
            errors: [],
            duration: 1000
        };
    }

    public async getContent(_lastSync?: Date): Promise<Content[]> {
        return [];
    }

    // Expose protected methods for testing
    public testExecuteWithRetry<T>(operation: () => Promise<T>): Promise<T> {
        return this.executeWithRetry(operation);
    }

    public testExecuteWithTimeout<T>(operation: () => Promise<T>, timeout?: number): Promise<T> {
        return this.executeWithTimeout(operation, timeout);
    }

    public testValidateConfig(): void {
        return this.validateConfig();
    }

    public testHandleError(error: unknown, operation: string): never {
        return this.handleError(error, operation);
    }
}

describe('DataSourceConnector', () => {
    let mockDataSource: DataSource;
    let connector: MockDataSourceConnector;

    beforeEach(() => {
        mockDataSource = {
            id: 'test-source-id',
            name: 'Test Source',
            type: 'file',
            config: {
                filePath: '/test/path',
                timeout: 5000,
                retryAttempts: 3,
                batchSize: 100
            },
            status: 'active',
            lastSync: new Date(),
            documentCount: 0
        };

        connector = new MockDataSourceConnector(mockDataSource);
    });

    describe('constructor', () => {
        it('should initialize with correct data source and default metrics', () => {
            expect(connector.getDataSource()).toEqual(mockDataSource);
            expect(connector.getConnectionStatus()).toBe(false);

            const metrics = connector.getMetrics();
            expect(metrics.totalQueries).toBe(0);
            expect(metrics.successfulQueries).toBe(0);
            expect(metrics.failedQueries).toBe(0);
            expect(metrics.averageResponseTime).toBe(0);
        });
    });

    describe('healthCheck', () => {
        it('should return healthy status when validation succeeds', async () => {
            connector.setValidationFailure(false);
            await connector.connect();

            const health = await connector.healthCheck();

            expect(health.sourceId).toBe(mockDataSource.id);
            expect(health.isHealthy).toBe(true);
            expect(health.responseTime).toBeGreaterThanOrEqual(0);
            expect(health.errorCount).toBe(0);
            expect(health.lastError).toBeUndefined();
        });

        it('should return unhealthy status when validation fails', async () => {
            connector.setValidationFailure(true);

            const health = await connector.healthCheck();

            expect(health.sourceId).toBe(mockDataSource.id);
            expect(health.isHealthy).toBe(false);
            expect(health.responseTime).toBeGreaterThanOrEqual(0);
            expect(health.errorCount).toBe(1);
            expect(health.lastError).toContain('Mock validation failed');
        });

        it('should measure response time accurately', async () => {
            const delay = 100;
            connector.setValidationDelay(delay);
            await connector.connect();

            const health = await connector.healthCheck();

            expect(health.responseTime).toBeGreaterThanOrEqual(delay);
        });
    });

    describe('executeWithRetry', () => {
        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await connector.testExecuteWithRetry(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry on retryable errors', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new ConnectionError('Connection failed'))
                .mockResolvedValue('success');

            const result = await connector.testExecuteWithRetry(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should not retry on non-retryable errors', async () => {
            const operation = jest.fn()
                .mockRejectedValue(new DataSourceError('Validation failed', 'VALIDATION_ERROR', 'test', false));

            await expect(connector.testExecuteWithRetry(operation)).rejects.toThrow('Validation failed');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should fail after max retry attempts', async () => {
            const operation = jest.fn()
                .mockRejectedValue(new ConnectionError('Connection failed'));

            await expect(connector.testExecuteWithRetry(operation)).rejects.toThrow('Operation failed after 3 attempts');
            expect(operation).toHaveBeenCalledTimes(3); // Default retry attempts
        });

        it('should update metrics correctly', async () => {
            const successOperation = jest.fn().mockResolvedValue('success');
            const failOperation = jest.fn().mockRejectedValue(new DataSourceError('Error', 'ERROR', 'test', false));

            await connector.testExecuteWithRetry(successOperation);

            try {
                await connector.testExecuteWithRetry(failOperation);
            } catch (error) {
                // Expected to fail
            }

            const metrics = connector.getMetrics();
            expect(metrics.totalQueries).toBe(2);
            expect(metrics.successfulQueries).toBe(1);
            expect(metrics.failedQueries).toBe(1);
        });
    });

    describe('executeWithTimeout', () => {
        it('should complete operation within timeout', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await connector.testExecuteWithTimeout(operation, 1000);

            expect(result).toBe('success');
        });

        it('should timeout long-running operations', async () => {
            const operation = jest.fn().mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve('success'), 200))
            );

            await expect(connector.testExecuteWithTimeout(operation, 100))
                .rejects.toThrow(TimeoutError);
        });

        it('should use default timeout from config', async () => {
            const operation = jest.fn().mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve('success'), 6000))
            );

            await expect(connector.testExecuteWithTimeout(operation))
                .rejects.toThrow(TimeoutError);
        });
    });

    describe('validateConfig', () => {
        it('should pass validation with valid config', () => {
            expect(() => connector.testValidateConfig()).not.toThrow();
        });

        it('should fail validation with invalid timeout', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, timeout: 500 }
            };
            const invalidConnector = new MockDataSourceConnector(invalidDataSource);

            expect(() => invalidConnector.testValidateConfig()).toThrow('Timeout must be between 1000ms and 300000ms');
        });

        it('should fail validation with invalid retry attempts', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, retryAttempts: 15 }
            };
            const invalidConnector = new MockDataSourceConnector(invalidDataSource);

            expect(() => invalidConnector.testValidateConfig()).toThrow('Retry attempts must be between 0 and 10');
        });

        it('should fail validation with invalid batch size', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, batchSize: 15000 }
            };
            const invalidConnector = new MockDataSourceConnector(invalidDataSource);

            expect(() => invalidConnector.testValidateConfig()).toThrow('Batch size must be between 1 and 10000');
        });
    });

    describe('handleError', () => {
        it('should convert generic errors to DataSourceError', () => {
            const genericError = new Error('Generic error');

            expect(() => connector.testHandleError(genericError, 'test operation'))
                .toThrow(DataSourceError);
        });

        it('should preserve DataSourceError instances', () => {
            const dataSourceError = new DataSourceError('Test error', 'TEST_ERROR', 'test', true);

            expect(() => connector.testHandleError(dataSourceError, 'test operation'))
                .toThrow(dataSourceError);
        });

        it('should convert timeout errors correctly', () => {
            const timeoutError = new Error('Operation timeout ETIMEDOUT');

            expect(() => connector.testHandleError(timeoutError, 'test operation'))
                .toThrow(TimeoutError);
        });

        it('should convert connection errors correctly', () => {
            const connectionError = new Error('Connection refused ECONNREFUSED');

            expect(() => connector.testHandleError(connectionError, 'test operation'))
                .toThrow(ConnectionError);
        });
    });

    describe('metrics management', () => {
        it('should track metrics correctly', () => {
            const initialMetrics = connector.getMetrics();
            expect(initialMetrics.totalQueries).toBe(0);

            connector.resetMetrics();
            const resetMetrics = connector.getMetrics();
            expect(resetMetrics.totalQueries).toBe(0);
            expect(resetMetrics.successfulQueries).toBe(0);
            expect(resetMetrics.failedQueries).toBe(0);
            expect(resetMetrics.averageResponseTime).toBe(0);
        });
    });

    describe('connection status', () => {
        it('should track connection status correctly', async () => {
            expect(connector.getConnectionStatus()).toBe(false);

            await connector.connect();
            expect(connector.getConnectionStatus()).toBe(true);

            await connector.disconnect();
            expect(connector.getConnectionStatus()).toBe(false);
        });
    });

    describe('last health check', () => {
        it('should track last health check time', async () => {
            expect(connector.getLastHealthCheck()).toBeUndefined();

            await connector.healthCheck();
            expect(connector.getLastHealthCheck()).toBeInstanceOf(Date);
        });
    });
});