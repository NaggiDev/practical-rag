"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRoutes = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const query_1 = require("../../models/query");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.queryRoutes = (0, express_1.Router)();
exports.queryRoutes.use(rateLimit_1.queryRateLimitMiddleware);
exports.queryRoutes.post('/', (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.queryRequest, 'body'), async (req, res, next) => {
    try {
        const startTime = Date.now();
        const { text, context, filters } = req.body;
        const query = new query_1.QueryModel({
            text,
            context,
            filters,
            userId: req.userId
        });
        const mockResult = await processQuery(query);
        const processingTime = Date.now() - startTime;
        const result = new query_1.QueryResultModel({
            id: (0, uuid_1.v4)(),
            response: mockResult.response,
            sources: mockResult.sources,
            confidence: mockResult.confidence,
            processingTime,
            cached: false
        });
        res.status(200).json({
            query: query.toJSON(),
            result: result.toJSON(),
            metadata: {
                processingTime,
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
        const mockResult = await getQueryResult(queryId, req.userId);
        if (!mockResult) {
            return res.status(404).json({
                error: {
                    code: 'QUERY_NOT_FOUND',
                    message: 'Query result not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        res.status(200).json({
            result: mockResult,
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
exports.queryRoutes.delete('/:queryId', (0, validation_1.validateWithJoi)(joi_1.default.object({ queryId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { queryId } = req.params;
        const cancelled = await cancelQuery(queryId, req.userId);
        if (!cancelled) {
            return res.status(404).json({
                error: {
                    code: 'QUERY_NOT_FOUND',
                    message: 'Query not found or cannot be cancelled',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        res.status(200).json({
            message: 'Query cancelled successfully',
            queryId,
            timestamp: new Date(),
            correlationId: req.correlationId
        });
    }
    catch (error) {
        next(error);
    }
});
async function processQuery(query) {
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
    return {
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
        confidence
    };
}
async function getQueryResult(_queryId, _userId) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return null;
}
async function cancelQuery(_queryId, _userId) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return false;
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