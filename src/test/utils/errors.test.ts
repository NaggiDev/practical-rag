import {
    AuthenticationError,
    BaseError,
    ConnectionError,
    DataSourceError,
    EmbeddingError,
    ErrorCategory,
    ErrorHandler,
    IndexingError,
    ParseError,
    RateLimitError,
    SearchError,
    SystemError,
    TimeoutError,
    ValidationError
} from '../../utils/errors';
import { logger } from '../../utils/logger';

// Mock the logger to capture error logs
jest.mock('../../utils/logger', () => ({
    logger: {
        error: jest.fn(),
        getCorrelationId: jest.fn(() => 'test-correlation-id')
    }
}));

describe('Error Classes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('BaseError', () => {
        it('should create a base error with all required properties', () => {
            const error = new BaseError(
                'Test error message',
                'TEST_ERROR',
                ErrorCategory.SYSTEM,
                true,
                { operation: 'test-operation' }
            );

            expect(error.message).toBe('Test error message');
            expect(error.code).toBe('TEST_ERROR');
            expect(error.category).toBe(ErrorCategory.SYSTEM);
            expect(error.retryable).toBe(true);
            expect(error.timestamp).toBeInstanceOf(Date);
            expect(error.correlationId).toBe('test-correlation-id');
            expect(error.context).toEqual({ operation: 'test-operation' });
            expect(error.name).toBe('BaseError');
        });

        it('should log error when created', () => {
            new BaseError(
                'Test error',
                'TEST_ERROR',
                ErrorCategory.PROCESSING,
                false,
                { sourceId: 'source123' }
            );

            expect(logger.error).toHaveBeenCalledWith('Test error', {
                errorCode: 'TEST_ERROR',
                errorCategory: ErrorCategory.PROCESSING,
                retryable: false,
                stackTrace: expect.any(String),
                sourceId: 'source123'
            });
        });

        it('should serialize to JSON correctly', () => {
            const error = new BaseError(
                'Test error',
                'TEST_ERROR',
                ErrorCategory.API,
                true,
                { userId: 'user123' }
            );

            const json = error.toJSON();
            expect(json).toEqual({
                name: 'BaseError',
                message: 'Test error',
                code: 'TEST_ERROR',
                category: ErrorCategory.API,
                retryable: true,
                timestamp: error.timestamp.toISOString(),
                correlationId: 'test-correlation-id',
                context: { userId: 'user123' }
            });
        });

        it('should default to non-retryable and empty context', () => {
            const error = new BaseError(
                'Simple error',
                'SIMPLE_ERROR',
                ErrorCategory.VALIDATION
            );

            expect(error.retryable).toBe(false);
            expect(error.context).toEqual({});
        });
    });

    describe('DataSourceError', () => {
        it('should create data source error with source ID', () => {
            const error = new DataSourceError(
                'Data source connection failed',
                'DS_CONNECTION_FAILED',
                'source123',
                true,
                { endpoint: 'http://example.com' }
            );

            expect(error.category).toBe(ErrorCategory.DATA_SOURCE);
            expect(error.sourceId).toBe('source123');
            expect(error.context.sourceId).toBe('source123');
            expect(error.context.endpoint).toBe('http://example.com');
            expect(error.retryable).toBe(true);
        });

        it('should work without source ID', () => {
            const error = new DataSourceError(
                'Generic data source error',
                'DS_GENERIC_ERROR'
            );

            expect(error.sourceId).toBeUndefined();
            expect(error.context.sourceId).toBeUndefined();
        });
    });

    describe('ConnectionError', () => {
        it('should create connection error with proper defaults', () => {
            const error = new ConnectionError(
                'Connection timeout',
                'source456',
                { timeout: 5000 }
            );

            expect(error.code).toBe('CONNECTION_ERROR');
            expect(error.category).toBe(ErrorCategory.DATA_SOURCE);
            expect(error.retryable).toBe(true);
            expect(error.sourceId).toBe('source456');
            expect(error.context.errorType).toBe('connection_failure');
            expect(error.context.timeout).toBe(5000);
        });
    });

    describe('AuthenticationError', () => {
        it('should create authentication error', () => {
            const error = new AuthenticationError(
                'Invalid credentials',
                'api-source',
                { username: 'testuser' }
            );

            expect(error.code).toBe('AUTHENTICATION_ERROR');
            expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
            expect(error.retryable).toBe(false);
            expect(error.context.sourceId).toBe('api-source');
            expect(error.context.errorType).toBe('authentication_failure');
        });
    });

    describe('ValidationError', () => {
        it('should create validation error with field and value', () => {
            const error = new ValidationError(
                'Invalid email format',
                'email',
                'invalid-email',
                { validator: 'email-validator' }
            );

            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.category).toBe(ErrorCategory.VALIDATION);
            expect(error.retryable).toBe(false);
            expect(error.field).toBe('email');
            expect(error.value).toBe('invalid-email');
            expect(error.context.field).toBe('email');
            expect(error.context.value).toBe('invalid-email');
            expect(error.context.errorType).toBe('validation_failure');
        });

        it('should handle object values by stringifying them', () => {
            const objectValue = { nested: { data: 'test' } };
            const error = new ValidationError(
                'Invalid object',
                'config',
                objectValue
            );

            expect(error.context.value).toBe(JSON.stringify(objectValue));
        });
    });

    describe('TimeoutError', () => {
        it('should create timeout error with operation and timeout details', () => {
            const error = new TimeoutError(
                'Operation timed out',
                'database_query',
                30000,
                { query: 'SELECT * FROM users' }
            );

            expect(error.code).toBe('TIMEOUT_ERROR');
            expect(error.category).toBe(ErrorCategory.NETWORK);
            expect(error.retryable).toBe(true);
            expect(error.operation).toBe('database_query');
            expect(error.timeoutMs).toBe(30000);
            expect(error.context.operation).toBe('database_query');
            expect(error.context.timeoutMs).toBe(30000);
            expect(error.context.errorType).toBe('timeout');
        });
    });

    describe('RateLimitError', () => {
        it('should create rate limit error with retry information', () => {
            const error = new RateLimitError(
                'Rate limit exceeded',
                60,
                100,
                { endpoint: '/api/search' }
            );

            expect(error.code).toBe('RATE_LIMIT_ERROR');
            expect(error.category).toBe(ErrorCategory.API);
            expect(error.retryable).toBe(true);
            expect(error.retryAfter).toBe(60);
            expect(error.limit).toBe(100);
            expect(error.context.retryAfter).toBe(60);
            expect(error.context.limit).toBe(100);
            expect(error.context.errorType).toBe('rate_limit_exceeded');
        });
    });

    describe('ParseError', () => {
        it('should create parse error with source type and position', () => {
            const error = new ParseError(
                'Invalid JSON syntax',
                'json',
                42,
                { fileName: 'config.json' }
            );

            expect(error.code).toBe('PARSE_ERROR');
            expect(error.category).toBe(ErrorCategory.PROCESSING);
            expect(error.retryable).toBe(false);
            expect(error.sourceType).toBe('json');
            expect(error.parsePosition).toBe(42);
            expect(error.context.sourceType).toBe('json');
            expect(error.context.parsePosition).toBe(42);
            expect(error.context.errorType).toBe('parse_failure');
        });
    });

    describe('SearchError', () => {
        it('should create search error with query and search type', () => {
            const error = new SearchError(
                'Vector search failed',
                'vector',
                'query123',
                { vectorDimension: 768 }
            );

            expect(error.code).toBe('SEARCH_ERROR');
            expect(error.category).toBe(ErrorCategory.SEARCH);
            expect(error.retryable).toBe(true);
            expect(error.searchType).toBe('vector');
            expect(error.queryId).toBe('query123');
            expect(error.context.searchType).toBe('vector');
            expect(error.context.queryId).toBe('query123');
            expect(error.context.errorType).toBe('search_failure');
        });
    });

    describe('EmbeddingError', () => {
        it('should create embedding error with model and text details', () => {
            const error = new EmbeddingError(
                'Embedding generation failed',
                'sentence-transformers',
                1024,
                { batchSize: 32 }
            );

            expect(error.code).toBe('EMBEDDING_ERROR');
            expect(error.category).toBe(ErrorCategory.PROCESSING);
            expect(error.retryable).toBe(true);
            expect(error.modelName).toBe('sentence-transformers');
            expect(error.textLength).toBe(1024);
            expect(error.context.modelName).toBe('sentence-transformers');
            expect(error.context.textLength).toBe(1024);
            expect(error.context.errorType).toBe('embedding_generation_failure');
        });
    });

    describe('IndexingError', () => {
        it('should create indexing error with document and index details', () => {
            const error = new IndexingError(
                'Document indexing failed',
                'vector_index',
                'doc123',
                { chunkCount: 15 }
            );

            expect(error.code).toBe('INDEXING_ERROR');
            expect(error.category).toBe(ErrorCategory.PROCESSING);
            expect(error.retryable).toBe(true);
            expect(error.indexType).toBe('vector_index');
            expect(error.documentId).toBe('doc123');
            expect(error.context.indexType).toBe('vector_index');
            expect(error.context.documentId).toBe('doc123');
            expect(error.context.errorType).toBe('indexing_failure');
        });
    });

    describe('SystemError', () => {
        it('should create system error with component and system info', () => {
            const systemInfo = { memoryUsage: '85%', cpuUsage: '60%' };
            const error = new SystemError(
                'System resource exhausted',
                'memory_manager',
                systemInfo,
                { threshold: 80 }
            );

            expect(error.code).toBe('SYSTEM_ERROR');
            expect(error.category).toBe(ErrorCategory.SYSTEM);
            expect(error.retryable).toBe(false);
            expect(error.component).toBe('memory_manager');
            expect(error.systemInfo).toEqual(systemInfo);
            expect(error.context.component).toBe('memory_manager');
            expect(error.context.systemInfo).toEqual(systemInfo);
            expect(error.context.errorType).toBe('system_failure');
        });
    });
});

describe('ErrorHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleError', () => {
        it('should return BaseError as-is', () => {
            const originalError = new ValidationError('Test validation error', 'field1');
            const handledError = ErrorHandler.handleError(originalError, 'test-operation');

            expect(handledError).toBe(originalError);
        });

        it('should convert standard Error to SystemError', () => {
            const standardError = new Error('Standard error message');
            const handledError = ErrorHandler.handleError(standardError, 'test-operation', {
                userId: 'user123'
            });

            expect(handledError).toBeInstanceOf(SystemError);
            expect(handledError.message).toBe('Standard error message');
            expect(handledError.code).toBe('SYSTEM_ERROR');
            expect(handledError.category).toBe(ErrorCategory.SYSTEM);
            expect(handledError.context.operation).toBe('test-operation');
            expect(handledError.context.userId).toBe('user123');
            expect(handledError.context.originalErrorName).toBe('Error');
        });

        it('should include original error details in system info', () => {
            const standardError = new TypeError('Type error message');
            standardError.stack = 'Error stack trace';

            const handledError = ErrorHandler.handleError(standardError, 'type-check') as SystemError;

            expect((handledError.systemInfo as any)?.originalError).toBe('TypeError');
            expect((handledError.systemInfo as any)?.stack).toBe('Error stack trace');
        });
    });

    describe('isRetryable', () => {
        it('should return retryable flag for BaseError', () => {
            const retryableError = new ConnectionError('Connection failed');
            const nonRetryableError = new ValidationError('Invalid input');

            expect(ErrorHandler.isRetryable(retryableError)).toBe(true);
            expect(ErrorHandler.isRetryable(nonRetryableError)).toBe(false);
        });

        it('should detect retryable standard errors by message content', () => {
            const timeoutError = new Error('Operation failed with ETIMEDOUT');
            const connectionError = new Error('ECONNRESET occurred');
            const refusedError = new Error('ECONNREFUSED - connection refused');
            const notFoundError = new Error('ENOTFOUND - host not found');
            const genericError = new Error('Generic error message');

            expect(ErrorHandler.isRetryable(timeoutError)).toBe(true);
            expect(ErrorHandler.isRetryable(connectionError)).toBe(true);
            expect(ErrorHandler.isRetryable(refusedError)).toBe(true);
            expect(ErrorHandler.isRetryable(notFoundError)).toBe(true);
            expect(ErrorHandler.isRetryable(genericError)).toBe(false);
        });
    });

    describe('getErrorCategory', () => {
        it('should return category for BaseError', () => {
            const dataSourceError = new DataSourceError('DS error', 'DS_ERROR');
            const processingError = new EmbeddingError('Embedding failed', 'model', 100);

            expect(ErrorHandler.getErrorCategory(dataSourceError)).toBe(ErrorCategory.DATA_SOURCE);
            expect(ErrorHandler.getErrorCategory(processingError)).toBe(ErrorCategory.PROCESSING);
        });

        it('should categorize standard errors by message content', () => {
            const timeoutError = new Error('Request timeout occurred');
            const connectionError = new Error('Connection failed');
            const authError = new Error('Authentication failed');
            const validationError = new Error('Validation error occurred');
            const genericError = new Error('Something went wrong');

            expect(ErrorHandler.getErrorCategory(timeoutError)).toBe(ErrorCategory.NETWORK);
            expect(ErrorHandler.getErrorCategory(connectionError)).toBe(ErrorCategory.NETWORK);
            expect(ErrorHandler.getErrorCategory(authError)).toBe(ErrorCategory.AUTHENTICATION);
            expect(ErrorHandler.getErrorCategory(validationError)).toBe(ErrorCategory.VALIDATION);
            expect(ErrorHandler.getErrorCategory(genericError)).toBe(ErrorCategory.SYSTEM);
        });
    });

    describe('createErrorResponse', () => {
        it('should create error response for BaseError', () => {
            const error = new ValidationError(
                'Invalid email format',
                'email',
                'invalid@',
                { validator: 'email-check' }
            );

            const response = ErrorHandler.createErrorResponse(error, 'custom-correlation-id');

            expect(response).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid email format',
                    category: ErrorCategory.VALIDATION,
                    retryable: false,
                    timestamp: error.timestamp.toISOString(),
                    correlationId: 'custom-correlation-id',
                    details: expect.objectContaining({
                        field: 'email',
                        value: 'invalid@',
                        validator: 'email-check'
                    })
                }
            });
        });

        it('should create error response for standard Error', () => {
            const error = new Error('Standard error');
            const response = ErrorHandler.createErrorResponse(error);

            expect(response.error.code).toBe('SYSTEM_ERROR');
            expect(response.error.message).toBe('Standard error');
            expect(response.error.category).toBe(ErrorCategory.SYSTEM);
            expect(response.error.retryable).toBe(false);
            expect(response.error.correlationId).toBe('test-correlation-id');
            expect(response.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });

        it('should use provided correlation ID over error correlation ID', () => {
            const error = new BaseError('Test error', 'TEST_ERROR', ErrorCategory.SYSTEM);
            const response = ErrorHandler.createErrorResponse(error, 'override-correlation-id');

            expect(response.error.correlationId).toBe('override-correlation-id');
        });
    });
});

describe('Error Categories', () => {
    it('should have all expected error categories', () => {
        expect(ErrorCategory.DATA_SOURCE).toBe('data_source');
        expect(ErrorCategory.PROCESSING).toBe('processing');
        expect(ErrorCategory.SEARCH).toBe('search');
        expect(ErrorCategory.API).toBe('api');
        expect(ErrorCategory.AUTHENTICATION).toBe('authentication');
        expect(ErrorCategory.VALIDATION).toBe('validation');
        expect(ErrorCategory.NETWORK).toBe('network');
        expect(ErrorCategory.SYSTEM).toBe('system');
    });
});