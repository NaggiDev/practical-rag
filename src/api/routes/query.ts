import { NextFunction, Response, Router } from 'express';
import Joi from 'joi';
import { QueryModel, QueryResultModel } from '../../models/query';
import { queryRateLimitMiddleware } from '../middleware/rateLimit';
import { commonSchemas, validateContentType, validateWithJoi } from '../middleware/validation';

export const queryRoutes = Router();

// Apply query-specific rate limiting
queryRoutes.use(queryRateLimitMiddleware);

// Initialize services (in production, these would be injected via DI)
let queryProcessor: any;

// Initialize query processor with dependencies
async function initializeQueryProcessor(): Promise<any> {
    if (queryProcessor) {
        return queryProcessor;
    }

    try {
        // For testing, use mock implementations
        if (process.env.NODE_ENV === 'test') {
            queryProcessor = createMockQueryProcessor();
            return queryProcessor;
        }

        // In production, dynamically import to avoid test issues
        const { QueryProcessor } = await import('../../services/queryProcessor');
        const { CacheManager } = await import('../../services/cache');
        const { VectorDatabase } = await import('../../services/vectorSearch');
        const { EmbeddingService } = await import('../../services/embedding');
        const { DataSourceManagerImpl } = await import('../../services/dataSourceManager');
        const { ConfigManager } = await import('../../config');

        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig();

        // Initialize dependencies
        const cacheManager = new CacheManager(config.cache);
        const vectorDatabase = new VectorDatabase({
            provider: config.database.vector.provider as 'faiss' | 'qdrant' | 'pinecone',
            dimension: config.database.vector.dimension,
            connectionString: config.database.vector.connectionString,
            apiKey: config.database.vector.apiKey,
            indexName: config.database.vector.indexName
        });
        const embeddingService = new EmbeddingService({
            provider: config.embedding.provider as 'huggingface' | 'openai' | 'local',
            model: config.embedding.model,
            apiKey: config.embedding.apiKey,
            batchSize: config.embedding.batchSize,
            timeout: config.embedding.timeout
        });
        const dataSourceManager = new DataSourceManagerImpl();

        // Initialize query processor
        queryProcessor = new QueryProcessor(
            {
                maxConcurrentQueries: 10,
                defaultTimeout: 30000,
                enableParallelSearch: true,
                cacheEnabled: true,
                minConfidenceThreshold: 0.1,
                maxResultsPerSource: 50
            },
            cacheManager,
            vectorDatabase,
            embeddingService,
            dataSourceManager
        );

        return queryProcessor;
    } catch (error) {
        console.error('Failed to initialize query processor:', error);
        throw error;
    }
}

// Mock query processor for testing
function createMockQueryProcessor(): any {
    const mockProcessor = {
        processQuery: async (query: any) => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));

            // Mock response based on query text
            const queryText = query.text.toLowerCase();
            let response = 'I found some relevant information for your query.';
            let confidence = 0.8;

            if (queryText.includes('error') || queryText.includes('problem')) {
                response = 'Based on the available documentation, here are some common solutions to this issue...';
                confidence = 0.9;
            } else if (queryText.includes('how to') || queryText.includes('tutorial')) {
                response = 'Here is a step-by-step guide to help you with this task...';
                confidence = 0.85;
            } else if (queryText.includes('api') || queryText.includes('endpoint')) {
                response = 'Here are the relevant API endpoints and their documentation...';
                confidence = 0.95;
            }

            return new QueryResultModel({
                response,
                sources: [
                    {
                        sourceId: 'mock-source-1',
                        sourceName: 'Documentation',
                        contentId: 'doc-123',
                        title: 'Relevant Documentation',
                        excerpt: 'This is a relevant excerpt from the documentation...',
                        relevanceScore: 0.9,
                        url: 'https://example.com/docs/relevant-page'
                    }
                ],
                confidence,
                processingTime: 100 + Math.random() * 400, // Mock processing time
                cached: false
            });
        },
        getQueryStatus: (_queryId: string) => {
            // Return null for testing (no active queries)
            return null;
        },
        cancelQuery: async (_queryId: string) => {
            // Return false for testing (query not found)
            return false;
        }
    };

    return mockProcessor as any;
}

/**
 * Submit a query for processing
 * POST /query
 */
queryRoutes.post('/',
    validateContentType(['application/json']),
    validateWithJoi(commonSchemas.queryRequest, 'body'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        const startTime = Date.now();
        let processor: any;

        try {
            const { text, context, filters } = req.body;

            // Create query model with validation
            const query = new QueryModel({
                text,
                context,
                filters,
                userId: req.userId
            });

            // Initialize query processor
            processor = await initializeQueryProcessor();

            // Process query through query processor
            const result = await processor.processQuery(query);

            // Format response with proper source attribution
            const formattedResponse = {
                query: {
                    id: query.id,
                    text: query.text,
                    context: query.context,
                    filters: query.filters,
                    timestamp: query.timestamp,
                    userId: query.userId
                },
                result: {
                    id: result.id,
                    response: result.response,
                    sources: result.sources.map((source: any) => ({
                        sourceId: source.sourceId,
                        sourceName: source.sourceName,
                        contentId: source.contentId,
                        title: source.title,
                        excerpt: source.excerpt,
                        relevanceScore: Math.round(source.relevanceScore * 1000) / 1000, // Round to 3 decimal places
                        url: source.url
                    })),
                    confidence: Math.round(result.confidence * 1000) / 1000, // Round to 3 decimal places
                    processingTime: result.processingTime,
                    cached: result.cached
                },
                metadata: {
                    totalSources: result.sources.length,
                    processingTime: result.processingTime,
                    timestamp: new Date(),
                    correlationId: req.correlationId,
                    version: '1.0.0'
                }
            };

            // Set appropriate status code based on result quality
            const statusCode = result.confidence > 0.5 ? 200 : 206; // 206 for partial content if low confidence

            res.status(statusCode).json(formattedResponse);

        } catch (error) {
            // Enhanced error handling with specific error types
            const processingTime = Date.now() - startTime;

            if (error instanceof Error) {
                // Handle specific error types
                if (error.name === 'ValidationError') {
                    return res.status(400).json({
                        error: {
                            code: 'QUERY_VALIDATION_ERROR',
                            message: error.message,
                            timestamp: new Date(),
                            correlationId: req.correlationId,
                            processingTime
                        }
                    });
                }

                if (error.message.includes('CAPACITY_EXCEEDED')) {
                    return res.status(503).json({
                        error: {
                            code: 'SERVICE_UNAVAILABLE',
                            message: 'Query processing capacity exceeded. Please try again later.',
                            timestamp: new Date(),
                            correlationId: req.correlationId,
                            processingTime,
                            retryAfter: 30 // seconds
                        }
                    });
                }

                if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
                    return res.status(408).json({
                        error: {
                            code: 'QUERY_TIMEOUT',
                            message: 'Query processing timed out. Please try a simpler query or try again later.',
                            timestamp: new Date(),
                            correlationId: req.correlationId,
                            processingTime
                        }
                    });
                }
            }

            // Log error for monitoring
            console.error('Query processing error:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                correlationId: req.correlationId,
                userId: req.userId,
                queryText: req.body?.text?.substring(0, 100), // Log first 100 chars for debugging
                processingTime
            });

            // Generic error response
            next(error);
        }
    }
);

/**
 * Submit a query for asynchronous processing
 * POST /query/async
 */
queryRoutes.post('/async',
    validateContentType(['application/json']),
    validateWithJoi(commonSchemas.queryRequest, 'body'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { text, context, filters } = req.body;

            // Create query model
            const query = new QueryModel({
                text,
                context,
                filters,
                userId: req.userId
            });

            // Initialize query processor
            const processor = await initializeQueryProcessor();

            // Start async processing (fire and forget)
            processor.processQuery(query).catch((error: any) => {
                console.error('Async query processing failed:', {
                    queryId: query.id,
                    error: error.message,
                    userId: req.userId
                });
            });

            // Return immediate response with query ID for status checking
            res.status(202).json({
                queryId: query.id,
                status: 'processing',
                message: 'Query submitted for processing',
                statusUrl: `/api/v1/query/${query.id}`,
                estimatedTime: '2-30 seconds',
                metadata: {
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Get query history for authenticated user
 * GET /query/history
 */
queryRoutes.get('/history',
    validateWithJoi(commonSchemas.pagination, 'query'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { page, limit } = req.query as any;

            // TODO: Implement actual query history retrieval
            // For now, return mock data
            const mockHistory = {
                queries: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0
                },
                metadata: {
                    userId: req.userId,
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            };

            res.status(200).json(mockHistory);

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Get query suggestions based on input
 * GET /query/suggestions
 */
queryRoutes.get('/suggestions',
    validateWithJoi(Joi.object({
        q: Joi.string().required().min(1).max(1000),
        limit: Joi.number().integer().min(1).max(50).default(5)
    }), 'query'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { q: queryText, limit } = req.query;

            // TODO: Implement actual query suggestions
            const suggestions = await getQuerySuggestions(queryText as string, limit as number);

            res.status(200).json({
                suggestions,
                metadata: {
                    queryText,
                    limit,
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Get specific query result by ID
 * GET /query/:queryId
 */
queryRoutes.get('/:queryId',
    validateWithJoi(Joi.object({ queryId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { queryId } = req.params;

            // Initialize query processor
            const processor = await initializeQueryProcessor();

            // Check if query is still processing
            const queryStatus = processor.getQueryStatus(queryId);

            if (queryStatus) {
                // Query is still processing
                const processingTime = Date.now() - queryStatus.startTime;

                return res.status(202).json({
                    queryId,
                    status: 'processing',
                    processingTime,
                    message: 'Query is still being processed',
                    metadata: {
                        startTime: new Date(queryStatus.startTime),
                        timestamp: new Date(),
                        correlationId: req.correlationId
                    }
                });
            }

            // Try to get cached result
            const cachedResult = await getCachedQueryResult(queryId);

            if (!cachedResult) {
                return res.status(404).json({
                    error: {
                        code: 'QUERY_NOT_FOUND',
                        message: 'Query result not found or has expired',
                        details: {
                            queryId,
                            suggestion: 'Query results are cached for a limited time. Please submit the query again.'
                        },
                        timestamp: new Date(),
                        correlationId: req.correlationId
                    }
                });
            }

            // Return cached result
            res.status(200).json({
                queryId,
                result: cachedResult,
                status: 'completed',
                metadata: {
                    cached: true,
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Cancel a running query
 * DELETE /query/:queryId
 */
queryRoutes.delete('/:queryId',
    validateWithJoi(Joi.object({ queryId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { queryId } = req.params;

            // Initialize query processor
            const processor = await initializeQueryProcessor();

            // Attempt to cancel the query
            const cancelled = await processor.cancelQuery(queryId);

            if (!cancelled) {
                return res.status(404).json({
                    error: {
                        code: 'QUERY_NOT_FOUND',
                        message: 'Query not found or cannot be cancelled',
                        details: {
                            queryId,
                            reason: 'Query may have already completed or was never started'
                        },
                        timestamp: new Date(),
                        correlationId: req.correlationId
                    }
                });
            }

            res.status(200).json({
                message: 'Query cancelled successfully',
                queryId,
                status: 'cancelled',
                timestamp: new Date(),
                correlationId: req.correlationId
            });

        } catch (error) {
            next(error);
        }
    }
);



/**
 * Get cached query result by ID
 */
async function getCachedQueryResult(_queryId: string): Promise<any | null> {
    try {
        // This is a simplified implementation - in production, you'd want a proper query result store
        // For now, we'll return null as results are not persisted beyond the processing lifecycle
        return null;
    } catch (error) {
        console.error('Error retrieving cached query result:', error);
        return null;
    }
}

/**
 * Mock query suggestions
 * TODO: Replace with actual suggestion engine
 */
async function getQuerySuggestions(queryText: string, limit: number): Promise<string[]> {
    // Simulate suggestion generation
    await new Promise(resolve => setTimeout(resolve, 100));

    const baseSuggestions = [
        'How to configure data sources',
        'API authentication methods',
        'Troubleshooting connection issues',
        'Best practices for query optimization',
        'Setting up vector embeddings'
    ];

    // Filter suggestions based on query text
    const filtered = baseSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(queryText.toLowerCase()) ||
        queryText.toLowerCase().split(' ').some(word =>
            suggestion.toLowerCase().includes(word)
        )
    );

    return filtered.slice(0, limit);
}
