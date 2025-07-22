import { ParsedQuery, Query, QueryFilter, QueryModel, QueryResult } from '../models/query';
import { CacheManager } from './cache';
import { DataSourceManager } from './dataSourceManager';
import { EmbeddingService } from './embedding';
import { SearchResult, VectorDatabase } from './vectorSearch';
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
export declare class QueryProcessor {
    private config;
    private cacheManager;
    private vectorDatabase;
    private embeddingService;
    private dataSourceManager;
    private activeQueries;
    constructor(config: QueryProcessorConfig, cacheManager: CacheManager, vectorDatabase: VectorDatabase, embeddingService: EmbeddingService, dataSourceManager: DataSourceManager);
    processQuery(query: string | Query, context?: object): Promise<QueryResult>;
    private withTimeout;
    private _processQueryInternal;
    parseQuery(queryText: string): Promise<ParsedQuery>;
    private preprocessQuery;
    private extractEntities;
    private classifyIntent;
    private extractFilters;
    private optimizeQuery;
    private expandQueryTerms;
    private getSynonyms;
    orchestrateSearch(optimizedQuery: QueryOptimization, queryModel: QueryModel): Promise<SearchResult[]>;
    private searchDataSource;
    private buildSearchFilter;
    private applyBoostFactors;
    private rankAndFilterResults;
    private generateQueryResult;
    private calculateOverallConfidence;
    private generateResponseText;
    private getCachedResult;
    private cacheResult;
    private generateQueryHash;
    getActiveQueryCount(): number;
    getQueryStatus(queryId: string): SearchContext | undefined;
    cancelQuery(queryId: string): Promise<boolean>;
    getConfig(): QueryProcessorConfig;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: object;
    }>;
}
//# sourceMappingURL=queryProcessor.d.ts.map