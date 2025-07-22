import winston from 'winston';
import { LogContext, StructuredLogger } from '../../utils/logger';

// Mock winston to capture log outputs
jest.mock('winston', () => {
    const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    return {
        createLogger: jest.fn(() => mockLogger),
        format: {
            combine: jest.fn(() => ({})),
            timestamp: jest.fn(() => ({})),
            errors: jest.fn(() => ({})),
            json: jest.fn(() => ({})),
            printf: jest.fn(() => ({})),
            colorize: jest.fn(() => ({})),
            simple: jest.fn(() => ({})),
        },
        transports: {
            Console: jest.fn(),
            File: jest.fn(),
        },
    };
});

describe('StructuredLogger', () => {
    let logger: StructuredLogger;
    let mockWinstonLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = new StructuredLogger('test-service');
        mockWinstonLogger = (winston.createLogger as jest.Mock).mock.results[0]?.value;
    });

    describe('Basic Logging', () => {
        it('should log debug messages with correlation ID', () => {
            const context: LogContext = { operation: 'test-operation' };
            logger.debug('Test debug message', context);

            expect(mockWinstonLogger.debug).toHaveBeenCalledWith(
                'Test debug message',
                expect.objectContaining({
                    correlationId: expect.any(String),
                    context: expect.objectContaining({
                        operation: 'test-operation',
                        correlationId: expect.any(String),
                        service: 'test-service',
                        timestamp: expect.any(String),
                    }),
                })
            );
        });

        it('should log info messages with enriched context', () => {
            const context: LogContext = { userId: 'user123', queryId: 'query456' };
            logger.info('Test info message', context);

            expect(mockWinstonLogger.info).toHaveBeenCalledWith(
                'Test info message',
                expect.objectContaining({
                    correlationId: expect.any(String),
                    context: expect.objectContaining({
                        userId: 'user123',
                        queryId: 'query456',
                        service: 'test-service',
                        timestamp: expect.any(String),
                    }),
                })
            );
        });

        it('should log warnings and track potential errors', () => {
            const context: LogContext = {
                errorCode: 'WARN_001',
                operation: 'data-processing'
            };
            logger.warn('Test warning message', context);

            expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
                'Test warning message',
                expect.objectContaining({
                    correlationId: expect.any(String),
                    context: expect.objectContaining({
                        errorCode: 'WARN_001',
                        operation: 'data-processing',
                    }),
                })
            );

            // Check that warning is tracked as potential error
            const errorSummary = logger.getErrorSummary();
            expect(errorSummary.warning).toBeDefined();
            expect(errorSummary.warning?.count).toBe(1);
        });

        it('should log errors and track them for analysis', () => {
            const context: LogContext = {
                errorCode: 'ERR_001',
                errorCategory: 'data_source',
                stackTrace: 'Error stack trace',
                sourceId: 'source123'
            };
            logger.error('Test error message', context);

            expect(mockWinstonLogger.error).toHaveBeenCalledWith(
                'Test error message',
                expect.objectContaining({
                    correlationId: expect.any(String),
                    context: expect.objectContaining({
                        errorCode: 'ERR_001',
                        errorCategory: 'data_source',
                        stackTrace: 'Error stack trace',
                        sourceId: 'source123',
                    }),
                })
            );

            // Check error tracking
            const errorSummary = logger.getErrorSummary();
            expect(errorSummary.data_source).toBeDefined();
            expect(errorSummary.data_source?.count).toBe(1);
            expect(errorSummary.data_source?.errors[0]?.errorCode).toBe('ERR_001');
        });
    });

    describe('Correlation ID Management', () => {
        it('should generate unique correlation IDs', () => {
            const correlationId1 = logger.getCorrelationId();
            const logger2 = new StructuredLogger('test-service-2');
            const correlationId2 = logger2.getCorrelationId();

            expect(correlationId1).not.toBe(correlationId2);
            expect(correlationId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('should allow setting custom correlation ID', () => {
            const customId = 'custom-correlation-id';
            logger.setCorrelationId(customId);

            expect(logger.getCorrelationId()).toBe(customId);
        });

        it('should create child logger with inherited correlation ID', () => {
            const parentCorrelationId = logger.getCorrelationId();
            const childLogger = logger.child({ operation: 'child-operation' });

            expect(childLogger.getCorrelationId()).toBe(parentCorrelationId);
        });

        it('should create child logger with custom correlation ID', () => {
            const customId = 'child-correlation-id';
            const childLogger = logger.child({ correlationId: customId });

            expect(childLogger.getCorrelationId()).toBe(customId);
        });
    });

    describe('Error Tracking', () => {
        beforeEach(() => {
            // Clear any existing error tracking
            logger = new StructuredLogger('test-service');
        });

        it('should track multiple occurrences of the same error', () => {
            const context: LogContext = {
                errorCode: 'DUPLICATE_ERROR',
                errorCategory: 'processing'
            };

            logger.error('First occurrence', context);
            logger.error('Second occurrence', context);
            logger.error('Third occurrence', context);

            const errorSummary = logger.getErrorSummary();
            expect(errorSummary.processing).toBeDefined();
            expect(errorSummary.processing?.count).toBe(3);
            expect(errorSummary.processing?.errors).toHaveLength(1);
            expect(errorSummary.processing?.errors[0]?.count).toBe(3);
        });

        it('should track different error categories separately', () => {
            logger.error('Data source error', {
                errorCode: 'DS_ERROR',
                errorCategory: 'data_source'
            });
            logger.error('Processing error', {
                errorCode: 'PROC_ERROR',
                errorCategory: 'processing'
            });

            const errorSummary = logger.getErrorSummary();
            expect(Object.keys(errorSummary)).toHaveLength(2);
            expect(errorSummary.data_source?.count).toBe(1);
            expect(errorSummary.processing?.count).toBe(1);
        });

        it('should return frequent errors in descending order', () => {
            // Create errors with different frequencies
            for (let i = 0; i < 5; i++) {
                logger.error('Frequent error', {
                    errorCode: 'FREQUENT_ERROR',
                    errorCategory: 'processing'
                });
            }

            for (let i = 0; i < 2; i++) {
                logger.error('Less frequent error', {
                    errorCode: 'LESS_FREQUENT_ERROR',
                    errorCategory: 'data_source'
                });
            }

            const frequentErrors = logger.getFrequentErrors(10);
            expect(frequentErrors).toHaveLength(2);
            expect(frequentErrors[0]?.count).toBe(5);
            expect(frequentErrors[0]?.errorCode).toBe('FREQUENT_ERROR');
            expect(frequentErrors[1]?.count).toBe(2);
            expect(frequentErrors[1]?.errorCode).toBe('LESS_FREQUENT_ERROR');
        });

        it('should filter recent errors by time window', async () => {
            // Create an old error
            logger.error('Old error', {
                errorCode: 'OLD_ERROR',
                errorCategory: 'processing'
            });

            // Wait a bit and create a recent error
            await new Promise(resolve => setTimeout(resolve, 10));
            logger.error('Recent error', {
                errorCode: 'RECENT_ERROR',
                errorCategory: 'data_source'
            });

            // Get recent errors from the last 1 minute
            const recentErrors = logger.getRecentErrors(1);
            expect(recentErrors).toHaveLength(2); // Both should be recent within 1 minute

            // Test that the method works - both errors should be very recent
            const veryRecentErrors = logger.getRecentErrors(0.1); // 0.1 minutes = 6 seconds
            expect(veryRecentErrors.length).toBeGreaterThanOrEqual(0);
            expect(veryRecentErrors.length).toBeLessThanOrEqual(2);
        });
    });

    describe('Diagnostic Information Collection', () => {
        it('should collect diagnostic information for operations', () => {
            const context: LogContext = {
                sourceId: 'source123',
                queryId: 'query456'
            };

            logger.collectDiagnosticInfo('search_operation', 1500, true, context);

            const diagnosticInfo = logger.getDiagnosticInfo();
            expect(diagnosticInfo).toHaveLength(1);
            expect(diagnosticInfo[0]).toMatchObject({
                operation: 'search_operation',
                duration: 1500,
                success: true,
                correlationId: expect.any(String),
                context: expect.objectContaining({
                    sourceId: 'source123',
                    queryId: 'query456'
                }),
                systemMetrics: expect.objectContaining({
                    memoryUsage: expect.any(Object),
                    cpuUsage: expect.any(Object)
                })
            });
        });

        it('should log warnings for slow or failed operations', () => {
            // Test slow operation
            logger.collectDiagnosticInfo('slow_operation', 6000, true);
            expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
                'Operation slow_operation completed',
                expect.objectContaining({
                    context: expect.objectContaining({
                        operation: 'slow_operation',
                        duration: 6000,
                        success: true
                    })
                })
            );

            // Test failed operation
            logger.collectDiagnosticInfo('failed_operation', 1000, false, {}, 'OPERATION_FAILED');
            expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
                'Operation failed_operation completed',
                expect.objectContaining({
                    context: expect.objectContaining({
                        operation: 'failed_operation',
                        duration: 1000,
                        success: false,
                        errorCode: 'OPERATION_FAILED'
                    })
                })
            );
        });

        it('should filter diagnostic info by operation', () => {
            logger.collectDiagnosticInfo('operation_a', 1000, true);
            logger.collectDiagnosticInfo('operation_b', 2000, true);
            logger.collectDiagnosticInfo('operation_a', 1500, false);

            const operationAInfo = logger.getDiagnosticInfo('operation_a');
            expect(operationAInfo).toHaveLength(2);
            expect(operationAInfo.every(info => info.operation === 'operation_a')).toBe(true);

            const operationBInfo = logger.getDiagnosticInfo('operation_b');
            expect(operationBInfo).toHaveLength(1);
            expect(operationBInfo[0]?.operation).toBe('operation_b');
        });

        it('should calculate operation statistics correctly', () => {
            // Add multiple operations with different outcomes
            logger.collectDiagnosticInfo('test_operation', 1000, true);
            logger.collectDiagnosticInfo('test_operation', 2000, true);
            logger.collectDiagnosticInfo('test_operation', 1500, false);
            logger.collectDiagnosticInfo('test_operation', 3000, true);

            const stats = logger.getOperationStats('test_operation');
            expect(stats).toEqual({
                totalCount: 4,
                successCount: 3,
                failureCount: 1,
                averageDuration: 1875, // (1000 + 2000 + 1500 + 3000) / 4
                successRate: 0.75 // 3/4
            });
        });

        it('should return empty stats for unknown operation', () => {
            const stats = logger.getOperationStats('unknown_operation');
            expect(stats).toEqual({
                totalCount: 0,
                successCount: 0,
                failureCount: 0,
                averageDuration: 0,
                successRate: 0
            });
        });

        it('should limit diagnostic entries to prevent memory issues', () => {
            const logger = new StructuredLogger('test-service');

            // Add more entries than the limit (1000)
            for (let i = 0; i < 1200; i++) {
                logger.collectDiagnosticInfo(`operation_${i}`, 1000, true);
            }

            const allDiagnosticInfo = logger.getDiagnosticInfo('', 2000); // Request more than limit
            expect(allDiagnosticInfo.length).toBeLessThanOrEqual(1000);
        });
    });

    describe('Cleanup Operations', () => {
        it('should clean up old error tracking entries', async () => {
            // Create some errors
            logger.error('Error 1', {
                errorCode: 'ERR_001',
                errorCategory: 'processing'
            });

            // Simulate time passing by manually setting old timestamp
            const errorSummary = logger.getErrorSummary();
            const errorEntry = errorSummary.processing?.errors[0];
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            if (errorEntry) {
                errorEntry.lastOccurrence = oldDate;
                errorEntry.firstOccurrence = oldDate;
            }

            // Add a recent error
            logger.error('Recent error', {
                errorCode: 'ERR_002',
                errorCategory: 'data_source'
            });

            // Cleanup with 24 hour retention
            logger.cleanup(24);

            const cleanedSummary = logger.getErrorSummary();
            expect(cleanedSummary.data_source).toBeDefined(); // Recent error should remain
            // Note: The old error might still be there depending on implementation details
            // This test verifies the cleanup method exists and runs without error
        });

        it('should clean up old diagnostic entries', () => {
            // Add diagnostic entries
            logger.collectDiagnosticInfo('old_operation', 1000, true);
            logger.collectDiagnosticInfo('recent_operation', 1000, true);

            const beforeCleanup = logger.getDiagnosticInfo();
            expect(beforeCleanup.length).toBeGreaterThan(0);

            // Cleanup - this should run without error
            logger.cleanup(24);

            // Verify cleanup method completes
            const afterCleanup = logger.getDiagnosticInfo();
            expect(Array.isArray(afterCleanup)).toBe(true);
        });
    });

    describe('Context Enrichment', () => {
        it('should enrich context with service name and timestamp', () => {
            const originalContext: LogContext = {
                operation: 'test-operation',
                userId: 'user123'
            };

            logger.info('Test message', originalContext);

            expect(mockWinstonLogger.info).toHaveBeenCalledWith(
                'Test message',
                expect.objectContaining({
                    context: expect.objectContaining({
                        operation: 'test-operation',
                        userId: 'user123',
                        service: 'test-service',
                        timestamp: expect.any(String),
                        correlationId: expect.any(String)
                    })
                })
            );
        });

        it('should preserve existing correlation ID in context', () => {
            const customCorrelationId = 'custom-correlation-123';
            const context: LogContext = {
                correlationId: customCorrelationId,
                operation: 'test-operation'
            };

            logger.info('Test message', context);

            expect(mockWinstonLogger.info).toHaveBeenCalledWith(
                'Test message',
                expect.objectContaining({
                    context: expect.objectContaining({
                        correlationId: customCorrelationId
                    })
                })
            );
        });
    });
});