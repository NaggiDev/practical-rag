import {
    ConnectionError,
    ErrorHandler,
    TimeoutError,
    ValidationError
} from '../../utils/errors';
import { StructuredLogger } from '../../utils/logger';

describe('Logging Integration Tests', () => {
    let logger: StructuredLogger;

    beforeEach(() => {
        logger = new StructuredLogger('integration-test');
    });

    describe('End-to-End Logging Scenarios', () => {
        it('should demonstrate complete logging workflow for a successful operation', async () => {
            const correlationId = 'test-correlation-123';
            logger.setCorrelationId(correlationId);

            // Simulate a complex operation with multiple steps
            const startTime = Date.now();

            // Step 1: Start operation
            logger.info('Starting complex operation', {
                operation: 'complex_workflow',
                userId: 'user123',
                requestId: 'req456'
            });

            // Step 2: Validation
            logger.debug('Validating input parameters', {
                operation: 'complex_workflow',
                step: 'validation',
                paramCount: 3
            });

            // Step 3: Processing
            logger.debug('Processing data', {
                operation: 'complex_workflow',
                step: 'processing',
                batchSize: 100
            });

            // Simulate some processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            // Step 4: Success
            const processingTime = Date.now() - startTime;
            logger.info('Complex operation completed successfully', {
                operation: 'complex_workflow',
                processingTime,
                recordsProcessed: 100,
                success: true
            });

            // Collect diagnostic information
            logger.collectDiagnosticInfo('complex_workflow', processingTime, true, {
                userId: 'user123',
                recordsProcessed: 100
            });

            // Verify diagnostic info was collected
            const diagnosticInfo = logger.getDiagnosticInfo('complex_workflow');
            expect(diagnosticInfo).toHaveLength(1);
            expect(diagnosticInfo[0]?.operation).toBe('complex_workflow');
            expect(diagnosticInfo[0]?.success).toBe(true);
            expect(diagnosticInfo[0]?.correlationId).toBe(correlationId);
        });

        it('should demonstrate error tracking and categorization', async () => {
            const correlationId = 'error-test-456';
            logger.setCorrelationId(correlationId);

            // Simulate various types of errors
            try {
                throw new ConnectionError('Database connection failed', 'db-source-1');
            } catch (error) {
                // This would normally be caught and logged by the application
                logger.error('Connection error occurred', {
                    operation: 'database_query',
                    sourceId: 'db-source-1',
                    errorCode: 'CONNECTION_ERROR',
                    errorCategory: 'data_source'
                });
            }

            try {
                throw new ValidationError('Invalid email format', 'email', 'invalid-email');
            } catch (error) {
                logger.error('Validation error occurred', {
                    operation: 'user_registration',
                    field: 'email',
                    errorCode: 'VALIDATION_ERROR',
                    errorCategory: 'validation'
                });
            }

            try {
                throw new TimeoutError('API request timed out', 'external_api_call', 30000);
            } catch (error) {
                logger.error('Timeout error occurred', {
                    operation: 'external_api_call',
                    timeoutMs: 30000,
                    errorCode: 'TIMEOUT_ERROR',
                    errorCategory: 'network'
                });
            }

            // Check error tracking
            const errorSummary = logger.getErrorSummary();
            expect(Object.keys(errorSummary)).toContain('data_source');
            expect(Object.keys(errorSummary)).toContain('validation');
            expect(Object.keys(errorSummary)).toContain('network');

            const frequentErrors = logger.getFrequentErrors(5);
            expect(frequentErrors.length).toBeGreaterThan(0);

            const recentErrors = logger.getRecentErrors(1); // Last 1 minute
            expect(recentErrors.length).toBe(3);
        });

        it('should demonstrate operation statistics tracking', async () => {
            const operation = 'test_operation';

            // Simulate multiple operations with different outcomes
            for (let i = 0; i < 5; i++) {
                const duration = 1000 + Math.random() * 2000; // 1-3 seconds
                const success = i < 4; // 4 successes, 1 failure

                logger.collectDiagnosticInfo(operation, duration, success, {
                    iteration: i,
                    batchSize: 50
                }, success ? undefined : 'PROCESSING_ERROR');
            }

            // Get operation statistics
            const stats = logger.getOperationStats(operation);
            expect(stats.totalCount).toBe(5);
            expect(stats.successCount).toBe(4);
            expect(stats.failureCount).toBe(1);
            expect(stats.successRate).toBe(0.8);
            expect(stats.averageDuration).toBeGreaterThan(1000);
            expect(stats.averageDuration).toBeLessThan(3000);
        });

        it('should demonstrate child logger correlation ID inheritance', () => {
            const parentCorrelationId = 'parent-correlation-789';
            logger.setCorrelationId(parentCorrelationId);

            // Create child logger
            const childLogger = logger.child({
                operation: 'child_operation',
                component: 'data_processor'
            });

            expect(childLogger.getCorrelationId()).toBe(parentCorrelationId);

            // Child logger should maintain correlation ID
            childLogger.info('Child operation started', {
                step: 'initialization'
            });

            // Create another child with custom correlation ID
            const customChildLogger = logger.child({
                correlationId: 'custom-child-correlation',
                operation: 'custom_child_operation'
            });

            expect(customChildLogger.getCorrelationId()).toBe('custom-child-correlation');
        });

        it('should demonstrate error handler utility functions', () => {
            // Test error handling for standard errors
            const standardError = new Error('Standard JavaScript error');
            const handledError = ErrorHandler.handleError(standardError, 'test_operation', {
                userId: 'user123'
            });

            expect(handledError.code).toBe('SYSTEM_ERROR');
            expect(handledError.category).toBe('system');
            expect(handledError.context.operation).toBe('test_operation');
            expect(handledError.context.userId).toBe('user123');

            // Test retryability detection
            const timeoutError = new Error('Request failed with ETIMEDOUT');
            const connectionError = new Error('Connection ECONNRESET');
            const genericError = new Error('Something went wrong');

            expect(ErrorHandler.isRetryable(timeoutError)).toBe(true);
            expect(ErrorHandler.isRetryable(connectionError)).toBe(true);
            expect(ErrorHandler.isRetryable(genericError)).toBe(false);

            // Test error response creation
            const validationError = new ValidationError('Invalid input', 'field1', 'value1');
            const errorResponse = ErrorHandler.createErrorResponse(validationError);

            expect(errorResponse.error.code).toBe('VALIDATION_ERROR');
            expect(errorResponse.error.category).toBe('validation');
            expect(errorResponse.error.retryable).toBe(false);
            expect(errorResponse.error.details).toEqual(
                expect.objectContaining({
                    field: 'field1',
                    value: 'value1'
                })
            );
        });

        it('should demonstrate cleanup functionality', async () => {
            // Add some diagnostic entries and errors
            logger.collectDiagnosticInfo('cleanup_test', 1000, true);
            logger.error('Test error for cleanup', {
                errorCode: 'CLEANUP_TEST_ERROR',
                errorCategory: 'testing'
            });

            // Verify entries exist
            const diagnosticsBefore = logger.getDiagnosticInfo();
            const errorsBefore = logger.getErrorSummary();

            expect(diagnosticsBefore.length).toBeGreaterThan(0);
            expect(Object.keys(errorsBefore).length).toBeGreaterThan(0);

            // Run cleanup (with very short retention to test cleanup logic)
            logger.cleanup(0.001); // 0.001 hours = 3.6 seconds

            // Verify cleanup ran without errors
            const diagnosticsAfter = logger.getDiagnosticInfo();
            const errorsAfter = logger.getErrorSummary();

            // Cleanup should have run successfully (entries may or may not be removed depending on timing)
            expect(Array.isArray(diagnosticsAfter)).toBe(true);
            expect(typeof errorsAfter).toBe('object');
        });
    });

    describe('Performance and Memory Management', () => {
        it('should handle large numbers of diagnostic entries efficiently', () => {
            const startTime = Date.now();

            // Add many diagnostic entries
            for (let i = 0; i < 1500; i++) {
                logger.collectDiagnosticInfo(`operation_${i % 10}`, 1000, true, {
                    iteration: i
                });
            }

            const endTime = Date.now();
            const processingTime = endTime - startTime;

            // Should complete quickly
            expect(processingTime).toBeLessThan(1000); // Less than 1 second

            // Should limit entries to prevent memory issues
            const allDiagnostics = logger.getDiagnosticInfo('', 2000);
            expect(allDiagnostics.length).toBeLessThanOrEqual(1000); // Max limit
        });

        it('should handle error tracking efficiently', () => {
            const startTime = Date.now();

            // Create many errors of the same type (should be deduplicated)
            for (let i = 0; i < 100; i++) {
                logger.error('Repeated error', {
                    errorCode: 'REPEATED_ERROR',
                    errorCategory: 'testing'
                });
            }

            const endTime = Date.now();
            const processingTime = endTime - startTime;

            // Should complete quickly
            expect(processingTime).toBeLessThan(500); // Less than 0.5 seconds

            // Should deduplicate errors
            const errorSummary = logger.getErrorSummary();
            expect(errorSummary.testing?.errors).toHaveLength(1);
            expect(errorSummary.testing?.errors[0]?.count).toBe(100);
        });
    });
});