"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRoutes = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const query_1 = require("../../models/query");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.queryRoutes = (0, express_1.Router)();
exports.queryRoutes.use(rateLimit_1.queryRateLimitMiddleware);
let queryProcessor;
async function initializeQueryProcessor() {
    if (queryProcessor) {
        return queryProcessor;
    }
    try {
        if (process.env.NODE_ENV === 'test') {
            queryProcessor = createMockQueryProcessor();
            return queryProcessor;
        }
        const { QueryProcessor } = await Promise.resolve().then(() => __importStar(require('../../services/queryProcessor')));
        const { CacheManager } = await Promise.resolve().then(() => __importStar(require('../../services/cache')));
        const { VectorDatabase } = await Promise.resolve().then(() => __importStar(require('../../services/vectorSearch')));
        const { EmbeddingService } = await Promise.resolve().then(() => __importStar(require('../../services/embedding')));
        const { DataSourceManagerImpl } = await Promise.resolve().then(() => __importStar(require('../../services/dataSourceManager')));
        const { ConfigManager } = await Promise.resolve().then(() => __importStar(require('../../config')));
        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig();
        const cacheManager = new CacheManager(config.cache);
        const vectorDatabase = new VectorDatabase({
            provider: config.database.vector.provider,
            dimension: config.database.vector.dimension,
            connectionString: config.database.vector.connectionString,
            apiKey: config.database.vector.apiKey,
            indexName: config.database.vector.indexName
        });
        const embeddingService = new EmbeddingService({
            provider: config.embedding.provider,
            model: config.embedding.model,
            apiKey: config.embedding.apiKey,
            batchSize: config.embedding.batchSize,
            timeout: config.embedding.timeout
        });
        const dataSourceManager = new DataSourceManagerImpl();
        queryProcessor = new QueryProcessor({
            maxConcurrentQueries: 10,
            defaultTimeout: 30000,
            enableParallelSearch: true,
            cacheEnabled: true,
            minConfidenceThreshold: 0.1,
            maxResultsPerSource: 50
        }, cacheManager, vectorDatabase, embeddingService, dataSourceManager);
        return queryProcessor;
    }
    catch (error) {
        console.error('Failed to initialize query processor:', error);
        throw error;
    }
}
function createMockQueryProcessor() {
    const mockProcessor = {
        processQuery: async (query) => {
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
            const queryText = query.text.toLowerCase();
            let response = 'I found some relevant information for your query.';
            let confidence = 0.8;
            if (queryText.includes('error') || queryText.includes('problem')) {
                response = 'Based on the available documentation, here are some common solutions to this issue...';
                confidence = 0.9;
            }
            else if (queryText.includes('how to') || queryText.includes('tutorial')) {
                response = 'Here is a step-by-step guide to help you with this task...';
                confidence = 0.85;
            }
            else if (queryText.includes('api') || queryText.includes('endpoint')) {
                response = 'Here are the relevant API endpoints and their documentation...';
                confidence = 0.95;
            }
            return new query_1.QueryResultModel({
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
                processingTime: 100 + Math.random() * 400,
                cached: false
            });
        },
        getQueryStatus: (_queryId) => {
            return null;
        },
        cancelQuery: async (_queryId) => {
            return false;
        }
    };
    return mockProcessor;
}
exports.queryRoutes.post('/', (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.queryRequest, 'body'), async (req, res, next) => {
    const startTime = Date.now();
    let processor;
    try {
        const { text, context, filters } = req.body;
        const query = new query_1.QueryModel({
            text,
            context,
            filters,
            userId: req.userId
        });
        processor = await initializeQueryProcessor();
        const result = await processor.processQuery(query);
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
                sources: result.sources.map((source) => ({
                    sourceId: source.sourceId,
                    sourceName: source.sourceName,
                    contentId: source.contentId,
                    title: source.title,
                    excerpt: source.excerpt,
                    relevanceScore: Math.round(source.relevanceScore * 1000) / 1000,
                    url: source.url
                })),
                confidence: Math.round(result.confidence * 1000) / 1000,
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
        const statusCode = result.confidence > 0.5 ? 200 : 206;
        res.status(statusCode).json(formattedResponse);
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        if (error instanceof Error) {
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
                        retryAfter: 30
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
        console.error('Query processing error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            correlationId: req.correlationId,
            userId: req.userId,
            queryText: req.body?.text?.substring(0, 100),
            processingTime
        });
        next(error);
    }
});
exports.queryRoutes.post('/async', (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.queryRequest, 'body'), async (req, res, next) => {
    try {
        const { text, context, filters } = req.body;
        const query = new query_1.QueryModel({
            text,
            context,
            filters,
            userId: req.userId
        });
        const processor = await initializeQueryProcessor();
        processor.processQuery(query).catch((error) => {
            console.error('Async query processing failed:', {
                queryId: query.id,
                error: error.message,
                userId: req.userId
            });
        });
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
    }
    catch (error) {
        next(error);
    }
});
exports.queryRoutes.get('/history', (0, validation_1.validateWithJoi)(validation_1.commonSchemas.pagination, 'query'), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
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
    }
    catch (error) {
        next(error);
    }
});
exports.queryRoutes.get('/suggestions', (0, validation_1.validateWithJoi)(joi_1.default.object({
    q: joi_1.default.string().required().min(1).max(1000),
    limit: joi_1.default.number().integer().min(1).max(50).default(5)
}), 'query'), async (req, res, next) => {
    try {
        const { q: queryText, limit } = req.query;
        const suggestions = await getQuerySuggestions(queryText, limit);
        res.status(200).json({
            suggestions,
            metadata: {
                queryText,
                limit,
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.queryRoutes.get('/:queryId', (0, validation_1.validateWithJoi)(joi_1.default.object({ queryId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { queryId } = req.params;
        const processor = await initializeQueryProcessor();
        const queryStatus = processor.getQueryStatus(queryId);
        if (queryStatus) {
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
    }
    catch (error) {
        next(error);
    }
});
exports.queryRoutes.delete('/:queryId', (0, validation_1.validateWithJoi)(joi_1.default.object({ queryId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { queryId } = req.params;
        const processor = await initializeQueryProcessor();
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
    }
    catch (error) {
        next(error);
    }
});
async function getCachedQueryResult(_queryId) {
    try {
        return null;
    }
    catch (error) {
        console.error('Error retrieving cached query result:', error);
        return null;
    }
}
async function getQuerySuggestions(queryText, limit) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const baseSuggestions = [
        'How to configure data sources',
        'API authentication methods',
        'Troubleshooting connection issues',
        'Best practices for query optimization',
        'Setting up vector embeddings'
    ];
    const filtered = baseSuggestions.filter(suggestion => suggestion.toLowerCase().includes(queryText.toLowerCase()) ||
        queryText.toLowerCase().split(' ').some(word => suggestion.toLowerCase().includes(word)));
    return filtered.slice(0, limit);
}
//# sourceMappingURL=query.js.map