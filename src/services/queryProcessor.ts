import crypto from 'crypto';
import { ParsedQuery, Query, QueryFilter, QueryModel, QueryResult, QueryResultModel } from '../models/query';
import { ValidationError } from '../utils/errors';
import { CacheManager } from './cache';
import { DataSourceManager } from './dataSourceManager';
import { EmbeddingService } from './embedding';
import { SearchOptions, SearchResult, VectorDatabase } from './vectorSearch';

// Use ProcessingError from utils/errors
export class ProcessingError extends BaseProcessingError {
    constructor(message: string, code: string, context?: LogContext) {
        super(message, 'processing', undefined, context);
        this.name = 'ProcessingError';
    }
}

export interface QueryProcessorConfig {
    maxConcurrentQueries: number;
    defaultTimeout: number;
    enableParallelSearch: boolean;
    cacheEnabled: boolean;
    minConfidenceThreshold: number;
    maxResultsPerSource: number;
}

export interface SearchContext {
    queryId: string;
    startTime: number;
    sourceResults: Map<string, SearchResult[]>;
    errors: Map<string, Error>;
    cached: boolean;
}

export interface QueryOptimization {
    expandedTerms: string[];
    synonyms: string[];
    filters: QueryFilter[];
    boost: Record<string, number>;
}

export class QueryProcessor {
    private config: QueryProcessorConfig;
    private cacheManager: CacheManager;
    private vectorDatabase: VectorDatabase;
    private embeddingService: EmbeddingService;
    private dataSourceManager: DataSourceManager;
    private activeQueries: Map<string, SearchContext> = new Map();

    constructor(
        config: QueryProcessorConfig,
        cacheManager: CacheManager,
        vectorDatabase: VectorDatabase,
        embeddingService: EmbeddingService,
        dataSourceManager: DataSourceManager
    ) {
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

        logger.info('QueryProcessor initialized', {
            operation: 'query_processor_init',
            config: this.config
        });
    }

    public async processQuery(query: string | Query, context?: object): Promise<QueryResult> {
        return this.withTimeout(
            this._processQueryInternal(query, context),
            this.config.defaultTimeout,
            'process_query'
        );
    }

    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        operation: string
    ): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                logger.warn('Operation timed out', {
                    operation,
                    timeoutMs
                });
                reject(new TimeoutError(
                    `Operation ${operation} timed out after ${timeoutMs}ms`,
                    operation,
                    timeoutMs
                ));
            }, timeoutMs);
        });

        return Promise.race([promise, timeoutPromise]);
    }

    private async _processQueryInternal(query: string | Query, context?: object): Promise<QueryResult> {
        const startTime = Date.now();
        let queryModel: QueryModel | undefined;
        let queryId: string | undefined;

        try {
            // Normalize input to QueryModel
            if (typeof query === 'string') {
                queryModel = new QueryModel({
                    text: query,
                    context
                });
            } else {
                queryModel = query instanceof QueryModel ? query : new QueryModel(query);
            }

            queryId = queryModel.id;
            const logContext: LogContext = {
                operation: 'process_query',
                queryId,
                queryText: queryModel.text.substring(0, 100), // Log first 100 chars
                userId: queryModel.userId
            };

            logger.info('Starting query processing', logContext);

            // Check if we're at capacity
            if (this.activeQueries.size >= this.config.maxConcurrentQueries) {
                logger.warn('Query processing capacity exceeded', {
                    ...logContext,
                    activeQueries: this.activeQueries.size,
                    maxConcurrentQueries: this.config.maxConcurrentQueries
                });
                throw new ProcessingError(
                    'Query processing capacity exceeded. Please try again later.',
                    'CAPACITY_EXCEEDED',
                    logContext
                );
            }

            // Create search context
            const searchContext: SearchContext = {
                queryId: queryModel.id,
                startTime,
                sourceResults: new Map(),
                errors: new Map(),
                cached: false
            };

            this.activeQueries.set(queryModel.id, searchContext);

            try {
                // Check cache first if enabled
                if (this.config.cacheEnabled) {
                    logger.debug('Checking cache for query', logContext);
                    const cachedResult = await this.getCachedResult(queryModel);
                    if (cachedResult) {
                        searchContext.cached = true;
                        const processingTime = Date.now() - startTime;

                        logger.info('Query served from cache', {
                            ...logContext,
                            processingTime,
                            cached: true
                        });

                        // Collect diagnostic info for cached queries
                        logger.collectDiagnosticInfo('process_query', processingTime, true, {
                            ...logContext,
                            cached: true
                        });

                        // Return cached result with cached flag set to true
                        return new QueryResultModel({
                            ...cachedResult,
                            cached: true
                        });
                    }
                    logger.debug('No cached result found', logContext);
                }

                // Parse and optimize query
                logger.debug('Parsing query', logContext);
                const parsedQuery = await this.parseQuery(queryModel.text);

                logger.debug('Optimizing query', { ...logContext, parsedQuery });
                const optimizedQuery = await this.optimizeQuery(parsedQuery, queryModel.context);

                // Orchestrate search across data sources
                logger.debug('Starting search orchestration', { ...logContext, optimizedQuery });
                const searchResults = await this.orchestrateSearch(optimizedQuery, queryModel);

                // Generate final result
                logger.debug('Generating query result', {
                    ...logContext,
                    searchResultsCount: searchResults.length
                });
                const result = await this.generateQueryResult(
                    queryModel,
                    searchResults,
                    startTime,
                    searchContext.cached
                );

                // Cache result if enabled
                if (this.config.cacheEnabled && !searchContext.cached) {
                    logger.debug('Caching query result', logContext);
                    await this.cacheResult(queryModel, result);
                }

                const processingTime = Date.now() - startTime;
                logger.info('Query processing completed successfully', {
                    ...logContext,
                    processingTime,
                    confidence: result.confidence,
                    sourcesCount: result.sources.length
                });

                // Collect diagnostic info for successful queries
                logger.collectDiagnosticInfo('process_query', processingTime, true, {
                    ...logContext,
                    confidence: result.confidence,
                    sourcesCount: result.sources.length
                });

                return result;

            } finally {
                this.activeQueries.delete(queryModel.id);
            }

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorContext: LogContext = {
                operation: 'process_query',
                queryId: queryId || 'unknown',
                processingTime,
                errorCode: error instanceof ProcessingError ? error.code : 'UNKNOWN_ERROR',
                errorCategory: 'processing'
            };

            // Log error with structured logging
            logger.error('Query processing failed', {
                ...errorContext,
                error: error instanceof Error ? error.message : 'Unknown error',
                stackTrace: error instanceof Error ? error.stack : undefined
            });

            // Collect diagnostic info for failed queries
            logger.collectDiagnosticInfo('process_query', processingTime, false, errorContext, errorContext.errorCode);

            // Create error result
            const errorResult = new QueryResultModel({
                response: 'I apologize, but I encountered an error while processing your query. Please try again.',
                sources: [],
                confidence: 0,
                processingTime,
                cached: false
            });

            return errorResult;
        }
    }

    public async parseQuery(queryText: string): Promise<ParsedQuery> {
        const logContext: LogContext = {
            operation: 'parse_query',
            queryLength: queryText?.length || 0
        };

        logger.debug('Starting query parsing', logContext);

        if (!queryText || queryText.trim().length === 0) {
            logger.warn('Empty query text provided', logContext);
            throw new ValidationError('Query text cannot be empty', 'queryText', queryText);
        }

        const processedText = this.preprocessQuery(queryText);
        logger.debug('Query preprocessing completed', {
            ...logContext,
            originalLength: queryText.length,
            processedLength: processedText.length
        });

        // Extract entities and intent (simplified implementation)
        const entities = this.extractEntities(queryText); // Use original text for entities
        const intent = this.classifyIntent(processedText);
        const filters = this.extractFilters(queryText); // Use original text for filters

        return {
            originalText: queryText,
            processedText,
            intent,
            entities,
            filters
        };
    }

    private preprocessQuery(queryText: string): string {
        // Basic text preprocessing
        return queryText
            .trim()
            .toLowerCase()
            .replace(/[^\w\s\-_.]/g, ' ') // Remove special chars except basic ones
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    private extractEntities(text: string): string[] {
        // Simple entity extraction - in production, use NLP libraries
        const entities: string[] = [];

        // Extract quoted phrases
        const quotedMatches = text.match(/"([^"]+)"/g);
        if (quotedMatches) {
            entities.push(...quotedMatches.map(match => match.replace(/"/g, '')));
        }

        // Extract capitalized words (potential proper nouns) - exclude common question words
        const questionWords = ['What', 'How', 'Why', 'When', 'Where', 'Who', 'Which'];
        const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g);
        if (capitalizedWords) {
            const filteredWords = capitalizedWords.filter(word => !questionWords.includes(word));
            entities.push(...filteredWords);
        }

        return [...new Set(entities)]; // Remove duplicates
    }

    private classifyIntent(text: string): string {
        // Simple intent classification - in production, use ML models
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

    private extractFilters(text: string): QueryFilter[] {
        const filters: QueryFilter[] = [];

        // Extract date filters
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

        // Extract type filters
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

    private async optimizeQuery(parsedQuery: ParsedQuery, context?: object): Promise<QueryOptimization> {
        // Query optimization logic
        const expandedTerms = await this.expandQueryTerms(parsedQuery.processedText);
        const synonyms = await this.getSynonyms(parsedQuery.entities);

        // Boost factors based on context
        const boost: Record<string, number> = {};
        if (context) {
            // Apply context-based boosting
            if ('domain' in context) {
                boost[context.domain as string] = 1.5;
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

    private async expandQueryTerms(text: string): Promise<string[]> {
        // Simple term expansion - in production, use word embeddings or thesaurus
        const words = text.split(' ');
        const expandedTerms: string[] = [...words];

        // Add stemmed versions (simplified)
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

    private async getSynonyms(entities: string[]): Promise<string[]> {
        // Simple synonym mapping - in production, use WordNet or similar
        const synonymMap: Record<string, string[]> = {
            'document': ['file', 'paper', 'text', 'record'],
            'user': ['person', 'individual', 'account', 'profile'],
            'system': ['application', 'platform', 'service', 'tool'],
            'data': ['information', 'content', 'records', 'details']
        };

        const synonyms: string[] = [];
        entities.forEach(entity => {
            const entityLower = entity.toLowerCase();
            if (synonymMap[entityLower]) {
                synonyms.push(...synonymMap[entityLower]);
            }
        });

        return [...new Set(synonyms)];
    }

    public async orchestrateSearch(
        optimizedQuery: QueryOptimization,
        queryModel: QueryModel
    ): Promise<SearchResult[]> {
        const startTime = Date.now();
        const logContext: LogContext = {
            operation: 'orchestrate_search',
            queryId: queryModel.id,
            parallelSearch: this.config.enableParallelSearch
        };

        logger.debug('Starting search orchestration', logContext);

        const searchTasks: Promise<SearchResult[]>[] = [];

        try {
            const queryEmbedding = await this.embeddingService.generateEmbedding(queryModel.text);
            logger.debug('Query embedding generated', {
                ...logContext,
                embeddingDimension: queryEmbedding.embedding.length
            });

            // Get active data sources
            const dataSources = await this.dataSourceManager.getActiveSources();
            logger.info('Retrieved active data sources', {
                ...logContext,
                dataSourceCount: dataSources.length,
                dataSources: dataSources.map(ds => ({ id: ds.id, type: ds.type }))
            });

            if (this.config.enableParallelSearch) {
                logger.debug('Executing parallel search across data sources', logContext);

                // Parallel search across all sources
                dataSources.forEach(source => {
                    const searchTask = this.searchDataSource(
                        source.id,
                        queryEmbedding.embedding,
                        optimizedQuery,
                        queryModel
                    );
                    searchTasks.push(searchTask);
                });

                // Wait for all searches to complete
                const results = await Promise.allSettled(searchTasks);
                const allResults: SearchResult[] = [];
                let successfulSources = 0;
                let failedSources = 0;

                results.forEach((result, index) => {
                    const sourceId = dataSources[index]?.id;
                    if (result.status === 'fulfilled') {
                        allResults.push(...result.value);
                        successfulSources++;
                        logger.debug('Search completed for source', {
                            ...logContext,
                            sourceId,
                            resultCount: result.value.length
                        });
                    } else {
                        failedSources++;
                        logger.error('Search failed for source', {
                            ...logContext,
                            sourceId,
                            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
                            stackTrace: result.reason instanceof Error ? result.reason.stack : undefined
                        });
                    }
                });

                const processingTime = Date.now() - startTime;
                logger.info('Parallel search orchestration completed', {
                    ...logContext,
                    processingTime,
                    totalResults: allResults.length,
                    successfulSources,
                    failedSources
                });

                // Collect diagnostic info
                logger.collectDiagnosticInfo('orchestrate_search', processingTime, failedSources === 0, {
                    ...logContext,
                    totalResults: allResults.length,
                    successfulSources,
                    failedSources
                });

                return this.rankAndFilterResults(allResults, optimizedQuery);
            } else {
                logger.debug('Executing sequential search across data sources', logContext);

                // Sequential search
                const allResults: SearchResult[] = [];
                let successfulSources = 0;
                let failedSources = 0;

                for (const source of dataSources) {
                    try {
                        logger.debug('Searching data source', { ...logContext, sourceId: source.id });
                        const results = await this.searchDataSource(
                            source.id,
                            queryEmbedding.embedding,
                            optimizedQuery,
                            queryModel
                        );
                        allResults.push(...results);
                        successfulSources++;
                        logger.debug('Search completed for source', {
                            ...logContext,
                            sourceId: source.id,
                            resultCount: results.length
                        });
                    } catch (error) {
                        failedSources++;
                        logger.error('Search failed for source', {
                            ...logContext,
                            sourceId: source.id,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            stackTrace: error instanceof Error ? error.stack : undefined
                        });
                    }
                }

                const processingTime = Date.now() - startTime;
                logger.info('Sequential search orchestration completed', {
                    ...logContext,
                    processingTime,
                    totalResults: allResults.length,
                    successfulSources,
                    failedSources
                });

                // Collect diagnostic info
                logger.collectDiagnosticInfo('orchestrate_search', processingTime, failedSources === 0, {
                    ...logContext,
                    totalResults: allResults.length,
                    successfulSources,
                    failedSources
                });

                return this.rankAndFilterResults(allResults, optimizedQuery);
            }
        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error('Search orchestration failed', {
                ...logContext,
                processingTime,
                error: error instanceof Error ? error.message : 'Unknown error',
                stackTrace: error instanceof Error ? error.stack : undefined
            });

            // Collect diagnostic info for failed orchestration
            logger.collectDiagnosticInfo('orchestrate_search', processingTime, false, logContext, 'ORCHESTRATION_FAILED');

            throw error;
        }
    }

    private async searchDataSource(
        sourceId: string,
        queryEmbedding: number[],
        optimizedQuery: QueryOptimization,
        queryModel: QueryModel
    ): Promise<SearchResult[]> {
        const searchOptions: SearchOptions = {
            topK: this.config.maxResultsPerSource,
            filter: this.buildSearchFilter(optimizedQuery.filters, sourceId),
            includeMetadata: true,
            threshold: this.config.minConfidenceThreshold
        };

        try {
            const results = await this.vectorDatabase.searchVectors(queryEmbedding, searchOptions);

            // Apply source-specific boosting
            return results.map(result => ({
                ...result,
                score: this.applyBoostFactors(result.score, result.metadata, optimizedQuery.boost),
                metadata: {
                    ...result.metadata,
                    sourceId,
                    queryId: queryModel.id
                }
            }));
        } catch (error) {
            console.error(`Vector search failed for source ${sourceId}:`, error);
            return [];
        }
    }

    private buildSearchFilter(filters: QueryFilter[], sourceId: string): Record<string, any> {
        const searchFilter: Record<string, any> = {
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

    private applyBoostFactors(
        originalScore: number,
        metadata: Record<string, any>,
        boostFactors: Record<string, number>
    ): number {
        let boostedScore = originalScore;

        Object.entries(boostFactors).forEach(([factor, boost]) => {
            if (metadata[factor]) {
                boostedScore *= boost;
            }
        });

        // Ensure score doesn't exceed 1.0
        return Math.min(boostedScore, 1.0);
    }

    private rankAndFilterResults(results: SearchResult[], _optimization: QueryOptimization): SearchResult[] {
        // Sort by score (descending)
        const sortedResults = results.sort((a, b) => b.score - a.score);

        // Remove duplicates based on content ID
        const uniqueResults = new Map<string, SearchResult>();
        sortedResults.forEach(result => {
            const contentId = result.metadata.contentId || result.id;
            if (!uniqueResults.has(contentId) || uniqueResults.get(contentId)!.score < result.score) {
                uniqueResults.set(contentId, result);
            }
        });

        // Filter by minimum confidence threshold
        const filteredResults = Array.from(uniqueResults.values())
            .filter(result => result.score >= this.config.minConfidenceThreshold);

        // Limit total results
        return filteredResults.slice(0, 100); // Max 100 results
    }

    private async generateQueryResult(
        queryModel: QueryModel,
        searchResults: SearchResult[],
        startTime: number,
        cached: boolean
    ): Promise<QueryResult> {
        const processingTime = Date.now() - startTime;

        // Calculate overall confidence based on top results
        const confidence = this.calculateOverallConfidence(searchResults);

        // Convert search results to source references
        const sources = searchResults.slice(0, 10).map(result => ({
            sourceId: result.metadata.sourceId || 'unknown',
            sourceName: result.metadata.sourceName || 'Unknown Source',
            contentId: result.metadata.contentId || result.id,
            title: result.metadata.title || 'Untitled',
            excerpt: result.metadata.excerpt || result.metadata.text?.substring(0, 200) || '',
            relevanceScore: result.score,
            url: result.metadata.url
        }));

        // Generate response text (simplified - in production, use LLM)
        const response = this.generateResponseText(queryModel.text, searchResults);

        return new QueryResultModel({
            response,
            sources,
            confidence,
            processingTime,
            cached
        });
    }

    private calculateOverallConfidence(results: SearchResult[]): number {
        if (results.length === 0) return 0;

        // Weight confidence by result position and score
        let weightedSum = 0;
        let totalWeight = 0;

        results.slice(0, 5).forEach((result, index) => {
            const positionWeight = 1 / (index + 1); // Higher weight for top results
            weightedSum += result.score * positionWeight;
            totalWeight += positionWeight;
        });

        return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1.0) : 0;
    }

    private generateResponseText(_query: string, results: SearchResult[]): string {
        if (results.length === 0) {
            return "I couldn't find any relevant information for your query. Please try rephrasing your question or check if the data sources contain the information you're looking for.";
        }

        // Simple response generation - in production, use LLM
        const topResult = results[0];
        if (!topResult) {
            return "I couldn't find any relevant information for your query.";
        }

        const excerpt = topResult.metadata.excerpt || topResult.metadata.text?.substring(0, 300) || '';

        if (results.length === 1) {
            return `Based on the available information: ${excerpt}`;
        } else {
            return `Based on multiple sources, here's what I found: ${excerpt}. I found ${results.length} relevant sources that may contain additional information.`;
        }
    }

    private async getCachedResult(queryModel: QueryModel): Promise<QueryResult | null> {
        const queryHash = this.generateQueryHash(queryModel);
        return await this.cacheManager.getCachedQueryResult(queryHash);
    }

    private async cacheResult(queryModel: QueryModel, result: QueryResult): Promise<void> {
        const queryHash = this.generateQueryHash(queryModel);
        await this.cacheManager.setCachedQueryResult(queryHash, result);
    }

    private generateQueryHash(queryModel: QueryModel): string {
        const hashInput = JSON.stringify({
            text: queryModel.text,
            context: queryModel.context,
            filters: queryModel.filters
        });

        return crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    // Public utility methods
    public getActiveQueryCount(): number {
        return this.activeQueries.size;
    }

    public getQueryStatus(queryId: string): SearchContext | undefined {
        return this.activeQueries.get(queryId);
    }

    public async cancelQuery(queryId: string): Promise<boolean> {
        const context = this.activeQueries.get(queryId);
        if (context) {
            this.activeQueries.delete(queryId);
            return true;
        }
        return false;
    }

    public getConfig(): QueryProcessorConfig {
        return { ...this.config };
    }

    public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: object }> {
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
        } catch (error) {
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
