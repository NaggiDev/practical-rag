"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryProcessor = exports.ProcessingError = void 0;
const crypto_1 = __importDefault(require("crypto"));
const query_1 = require("../models/query");
const errors_1 = require("../utils/errors");
class ProcessingError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ProcessingError';
        this.code = code;
    }
}
exports.ProcessingError = ProcessingError;
class QueryProcessor {
    constructor(config, cacheManager, vectorDatabase, embeddingService, dataSourceManager) {
        this.activeQueries = new Map();
        this.config = {
            ...{
                maxConcurrentQueries: 10,
                defaultTimeout: 30000,
                enableParallelSearch: true,
                cacheEnabled: true,
                minConfidenceThreshold: 0.1,
                maxResultsPerSource: 50
            },
            ...config
        };
        this.cacheManager = cacheManager;
        this.vectorDatabase = vectorDatabase;
        this.embeddingService = embeddingService;
        this.dataSourceManager = dataSourceManager;
    }
    async processQuery(query, context) {
        const startTime = Date.now();
        let queryModel;
        try {
            if (typeof query === 'string') {
                queryModel = new query_1.QueryModel({
                    text: query,
                    context
                });
            }
            else {
                queryModel = query instanceof query_1.QueryModel ? query : new query_1.QueryModel(query);
            }
            if (this.activeQueries.size >= this.config.maxConcurrentQueries) {
                throw new ProcessingError('Query processing capacity exceeded. Please try again later.', 'CAPACITY_EXCEEDED');
            }
            const searchContext = {
                queryId: queryModel.id,
                startTime,
                sourceResults: new Map(),
                errors: new Map(),
                cached: false
            };
            this.activeQueries.set(queryModel.id, searchContext);
            try {
                if (this.config.cacheEnabled) {
                    const cachedResult = await this.getCachedResult(queryModel);
                    if (cachedResult) {
                        searchContext.cached = true;
                        return new query_1.QueryResultModel({
                            ...cachedResult,
                            cached: true
                        });
                    }
                }
                const parsedQuery = await this.parseQuery(queryModel.text);
                const optimizedQuery = await this.optimizeQuery(parsedQuery, queryModel.context);
                const searchResults = await this.orchestrateSearch(optimizedQuery, queryModel);
                const result = await this.generateQueryResult(queryModel, searchResults, startTime, searchContext.cached);
                if (this.config.cacheEnabled && !searchContext.cached) {
                    await this.cacheResult(queryModel, result);
                }
                return result;
            }
            finally {
                this.activeQueries.delete(queryModel.id);
            }
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            const errorResult = new query_1.QueryResultModel({
                response: 'I apologize, but I encountered an error while processing your query. Please try again.',
                sources: [],
                confidence: 0,
                processingTime,
                cached: false
            });
            console.error('Query processing error:', {
                queryId: queryModel?.id || 'unknown',
                error: error instanceof Error ? error.message : 'Unknown error',
                processingTime
            });
            return errorResult;
        }
    }
    async parseQuery(queryText) {
        if (!queryText || queryText.trim().length === 0) {
            throw new errors_1.ValidationError('Query text cannot be empty');
        }
        const processedText = this.preprocessQuery(queryText);
        const entities = this.extractEntities(queryText);
        const intent = this.classifyIntent(processedText);
        const filters = this.extractFilters(queryText);
        return {
            originalText: queryText,
            processedText,
            intent,
            entities,
            filters
        };
    }
    preprocessQuery(queryText) {
        return queryText
            .trim()
            .toLowerCase()
            .replace(/[^\w\s\-_.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    extractEntities(text) {
        const entities = [];
        const quotedMatches = text.match(/"([^"]+)"/g);
        if (quotedMatches) {
            entities.push(...quotedMatches.map(match => match.replace(/"/g, '')));
        }
        const questionWords = ['What', 'How', 'Why', 'When', 'Where', 'Who', 'Which'];
        const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g);
        if (capitalizedWords) {
            const filteredWords = capitalizedWords.filter(word => !questionWords.includes(word));
            entities.push(...filteredWords);
        }
        return [...new Set(entities)];
    }
    classifyIntent(text) {
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
        const actionWords = ['find', 'search', 'get', 'show', 'list', 'explain'];
        const words = text.split(' ');
        if (words.some(word => questionWords.includes(word))) {
            return 'question';
        }
        if (words.some(word => actionWords.includes(word))) {
            return 'search';
        }
        return 'general';
    }
    extractFilters(text) {
        const filters = [];
        const datePattern = /(?:after|before|since|until)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/gi;
        const dateMatches = text.match(datePattern);
        if (dateMatches) {
            dateMatches.forEach(match => {
                const parts = match.split(/\s+/);
                const operator = parts[0];
                const dateStr = parts[1];
                if (operator && dateStr) {
                    const field = 'date';
                    const op = operator.toLowerCase() === 'after' || operator.toLowerCase() === 'since' ? 'gte' : 'lte';
                    filters.push({
                        field,
                        operator: op,
                        value: dateStr
                    });
                }
            });
        }
        const typePattern = /type:\s*(\w+)/gi;
        const typeMatches = text.match(typePattern);
        if (typeMatches) {
            typeMatches.forEach(match => {
                const type = match.split(':')[1]?.trim();
                if (type) {
                    filters.push({
                        field: 'type',
                        operator: 'eq',
                        value: type
                    });
                }
            });
        }
        return filters;
    }
    async optimizeQuery(parsedQuery, context) {
        const expandedTerms = await this.expandQueryTerms(parsedQuery.processedText);
        const synonyms = await this.getSynonyms(parsedQuery.entities);
        const boost = {};
        if (context) {
            if ('domain' in context) {
                boost[context.domain] = 1.5;
            }
            if ('recency' in context && context.recency === 'recent') {
                boost['recent'] = 1.2;
            }
        }
        return {
            expandedTerms,
            synonyms,
            filters: parsedQuery.filters,
            boost
        };
    }
    async expandQueryTerms(text) {
        const words = text.split(' ');
        const expandedTerms = [...words];
        words.forEach(word => {
            if (word.endsWith('ing')) {
                expandedTerms.push(word.slice(0, -3));
            }
            if (word.endsWith('ed')) {
                expandedTerms.push(word.slice(0, -2));
            }
            if (word.endsWith('s') && word.length > 3) {
                expandedTerms.push(word.slice(0, -1));
            }
        });
        return [...new Set(expandedTerms)];
    }
    async getSynonyms(entities) {
        const synonymMap = {
            'document': ['file', 'paper', 'text', 'record'],
            'user': ['person', 'individual', 'account', 'profile'],
            'system': ['application', 'platform', 'service', 'tool'],
            'data': ['information', 'content', 'records', 'details']
        };
        const synonyms = [];
        entities.forEach(entity => {
            const entityLower = entity.toLowerCase();
            if (synonymMap[entityLower]) {
                synonyms.push(...synonymMap[entityLower]);
            }
        });
        return [...new Set(synonyms)];
    }
    async orchestrateSearch(optimizedQuery, queryModel) {
        const searchTasks = [];
        const queryEmbedding = await this.embeddingService.generateEmbedding(queryModel.text);
        const dataSources = await this.dataSourceManager.getActiveSources();
        if (this.config.enableParallelSearch) {
            dataSources.forEach(source => {
                const searchTask = this.searchDataSource(source.id, queryEmbedding.embedding, optimizedQuery, queryModel);
                searchTasks.push(searchTask);
            });
            const results = await Promise.allSettled(searchTasks);
            const allResults = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    allResults.push(...result.value);
                }
                else {
                    console.error(`Search failed for source ${dataSources[index]?.id}:`, result.reason);
                }
            });
            return this.rankAndFilterResults(allResults, optimizedQuery);
        }
        else {
            const allResults = [];
            for (const source of dataSources) {
                try {
                    const results = await this.searchDataSource(source.id, queryEmbedding.embedding, optimizedQuery, queryModel);
                    allResults.push(...results);
                }
                catch (error) {
                    console.error(`Search failed for source ${source.id}:`, error);
                }
            }
            return this.rankAndFilterResults(allResults, optimizedQuery);
        }
    }
    async searchDataSource(sourceId, queryEmbedding, optimizedQuery, queryModel) {
        const searchOptions = {
            topK: this.config.maxResultsPerSource,
            filter: this.buildSearchFilter(optimizedQuery.filters, sourceId),
            includeMetadata: true,
            threshold: this.config.minConfidenceThreshold
        };
        try {
            const results = await this.vectorDatabase.searchVectors(queryEmbedding, searchOptions);
            return results.map(result => ({
                ...result,
                score: this.applyBoostFactors(result.score, result.metadata, optimizedQuery.boost),
                metadata: {
                    ...result.metadata,
                    sourceId,
                    queryId: queryModel.id
                }
            }));
        }
        catch (error) {
            console.error(`Vector search failed for source ${sourceId}:`, error);
            return [];
        }
    }
    buildSearchFilter(filters, sourceId) {
        const searchFilter = {
            sourceId
        };
        filters.forEach(filter => {
            switch (filter.operator) {
                case 'eq':
                    searchFilter[filter.field] = filter.value;
                    break;
                case 'ne':
                    searchFilter[filter.field] = { $ne: filter.value };
                    break;
                case 'gt':
                    searchFilter[filter.field] = { $gt: filter.value };
                    break;
                case 'gte':
                    searchFilter[filter.field] = { $gte: filter.value };
                    break;
                case 'lt':
                    searchFilter[filter.field] = { $lt: filter.value };
                    break;
                case 'lte':
                    searchFilter[filter.field] = { $lte: filter.value };
                    break;
                case 'in':
                    searchFilter[filter.field] = { $in: Array.isArray(filter.value) ? filter.value : [filter.value] };
                    break;
                case 'contains':
                    searchFilter[filter.field] = { $regex: filter.value, $options: 'i' };
                    break;
            }
        });
        return searchFilter;
    }
    applyBoostFactors(originalScore, metadata, boostFactors) {
        let boostedScore = originalScore;
        Object.entries(boostFactors).forEach(([factor, boost]) => {
            if (metadata[factor]) {
                boostedScore *= boost;
            }
        });
        return Math.min(boostedScore, 1.0);
    }
    rankAndFilterResults(results, _optimization) {
        const sortedResults = results.sort((a, b) => b.score - a.score);
        const uniqueResults = new Map();
        sortedResults.forEach(result => {
            const contentId = result.metadata.contentId || result.id;
            if (!uniqueResults.has(contentId) || uniqueResults.get(contentId).score < result.score) {
                uniqueResults.set(contentId, result);
            }
        });
        const filteredResults = Array.from(uniqueResults.values())
            .filter(result => result.score >= this.config.minConfidenceThreshold);
        return filteredResults.slice(0, 100);
    }
    async generateQueryResult(queryModel, searchResults, startTime, cached) {
        const processingTime = Date.now() - startTime;
        const confidence = this.calculateOverallConfidence(searchResults);
        const sources = searchResults.slice(0, 10).map(result => ({
            sourceId: result.metadata.sourceId || 'unknown',
            sourceName: result.metadata.sourceName || 'Unknown Source',
            contentId: result.metadata.contentId || result.id,
            title: result.metadata.title || 'Untitled',
            excerpt: result.metadata.excerpt || result.metadata.text?.substring(0, 200) || '',
            relevanceScore: result.score,
            url: result.metadata.url
        }));
        const response = this.generateResponseText(queryModel.text, searchResults);
        return new query_1.QueryResultModel({
            response,
            sources,
            confidence,
            processingTime,
            cached
        });
    }
    calculateOverallConfidence(results) {
        if (results.length === 0)
            return 0;
        let weightedSum = 0;
        let totalWeight = 0;
        results.slice(0, 5).forEach((result, index) => {
            const positionWeight = 1 / (index + 1);
            weightedSum += result.score * positionWeight;
            totalWeight += positionWeight;
        });
        return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1.0) : 0;
    }
    generateResponseText(_query, results) {
        if (results.length === 0) {
            return "I couldn't find any relevant information for your query. Please try rephrasing your question or check if the data sources contain the information you're looking for.";
        }
        const topResult = results[0];
        if (!topResult) {
            return "I couldn't find any relevant information for your query.";
        }
        const excerpt = topResult.metadata.excerpt || topResult.metadata.text?.substring(0, 300) || '';
        if (results.length === 1) {
            return `Based on the available information: ${excerpt}`;
        }
        else {
            return `Based on multiple sources, here's what I found: ${excerpt}. I found ${results.length} relevant sources that may contain additional information.`;
        }
    }
    async getCachedResult(queryModel) {
        const queryHash = this.generateQueryHash(queryModel);
        return await this.cacheManager.getCachedQueryResult(queryHash);
    }
    async cacheResult(queryModel, result) {
        const queryHash = this.generateQueryHash(queryModel);
        await this.cacheManager.setCachedQueryResult(queryHash, result);
    }
    generateQueryHash(queryModel) {
        const hashInput = JSON.stringify({
            text: queryModel.text,
            context: queryModel.context,
            filters: queryModel.filters
        });
        return crypto_1.default.createHash('sha256').update(hashInput).digest('hex');
    }
    getActiveQueryCount() {
        return this.activeQueries.size;
    }
    getQueryStatus(queryId) {
        return this.activeQueries.get(queryId);
    }
    async cancelQuery(queryId) {
        const context = this.activeQueries.get(queryId);
        if (context) {
            this.activeQueries.delete(queryId);
            return true;
        }
        return false;
    }
    getConfig() {
        return { ...this.config };
    }
    async healthCheck() {
        try {
            const cacheHealthy = await this.cacheManager.healthCheck();
            const vectorDbHealth = await this.vectorDatabase.healthCheck();
            const isHealthy = cacheHealthy && vectorDbHealth.status === 'healthy';
            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                details: {
                    activeQueries: this.activeQueries.size,
                    maxConcurrentQueries: this.config.maxConcurrentQueries,
                    cacheEnabled: this.config.cacheEnabled,
                    cacheHealthy,
                    vectorDbHealthy: vectorDbHealth.status === 'healthy',
                    lastCheck: new Date().toISOString()
                }
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }
}
exports.QueryProcessor = QueryProcessor;
//# sourceMappingURL=queryProcessor.js.map