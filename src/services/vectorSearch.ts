import { PineconeClient } from '@pinecone-database/pinecone';
import { QdrantClient } from '@qdrant/js-client-rest';
import { IndexFlatL2 } from 'faiss-node';
import { DataSourceError, ValidationError } from '../utils/errors';

export interface VectorDatabaseConfig {
    provider: 'faiss' | 'qdrant' | 'pinecone';
    dimension: number;
    indexType?: string;
    connectionString?: string;
    apiKey?: string;
    environment?: string;
    indexName?: string;
    metricType?: 'l2' | 'ip' | 'cosine';
    nlist?: number; // For IVF indexes
    timeout?: number;
}

export interface VectorRecord {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

export interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}

export interface SearchOptions {
    topK: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
    threshold?: number;
}

export interface IndexStats {
    totalVectors: number;
    dimension: number;
    indexType: string;
    memoryUsage?: number;
    lastUpdated: Date;
}

export interface HybridSearchOptions extends SearchOptions {
    keywordWeight?: number;
    vectorWeight?: number;
    keywordBoost?: Record<string, number>;
    rerankResults?: boolean;
}

export interface RankedSearchResult extends SearchResult {
    vectorScore: number;
    keywordScore?: number;
    finalScore: number;
    rankingFactors: {
        semantic: number;
        keyword?: number;
        metadata?: number;
        recency?: number;
    };
}

export class VectorSearchEngine {
    private vectorDb: VectorDatabase;
    private embeddingService: any; // Will be injected
    private isInitialized: boolean = false;

    constructor(vectorDb: VectorDatabase, embeddingService?: any) {
        this.vectorDb = vectorDb;
        this.embeddingService = embeddingService;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        await this.vectorDb.initialize();
        this.isInitialized = true;
    }

    public async semanticSearch(
        query: string,
        options: SearchOptions
    ): Promise<RankedSearchResult[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.embeddingService) {
            throw new DataSourceError('Embedding service not configured', 'EMBEDDING_SERVICE_MISSING');
        }

        try {
            // Generate query embedding
            const embeddingResult = await this.embeddingService.generateEmbedding(query);
            const queryVector = embeddingResult.embedding;

            // Perform vector search
            const vectorResults = await this.vectorDb.searchVectors(queryVector, options);

            // Convert to ranked results with semantic scoring
            const rankedResults: RankedSearchResult[] = vectorResults.map(result => ({
                ...result,
                vectorScore: result.score,
                finalScore: result.score,
                rankingFactors: {
                    semantic: result.score,
                    metadata: 0,
                    recency: 0
                }
            }));

            // Apply additional ranking factors
            return this.applyRankingFactors(rankedResults, query, options);
        } catch (error) {
            throw new DataSourceError(
                `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'SEMANTIC_SEARCH_ERROR'
            );
        }
    }

    public async hybridSearch(
        query: string,
        options: HybridSearchOptions
    ): Promise<RankedSearchResult[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const vectorWeight = options.vectorWeight ?? 0.7;
            const keywordWeight = options.keywordWeight ?? 0.3;

            // Perform semantic search
            const semanticResults = await this.semanticSearch(query, options);

            // Perform keyword search
            const keywordResults = await this.keywordSearch(query, options);

            // Combine and rerank results
            const combinedResults = this.combineSearchResults(
                semanticResults,
                keywordResults,
                vectorWeight,
                keywordWeight
            );

            // Apply reranking if requested
            if (options.rerankResults) {
                return this.rerankResults(combinedResults, query, options);
            }

            return combinedResults.slice(0, options.topK);
        } catch (error) {
            throw new DataSourceError(
                `Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'HYBRID_SEARCH_ERROR'
            );
        }
    }

    private async keywordSearch(
        query: string,
        options: HybridSearchOptions
    ): Promise<RankedSearchResult[]> {
        // Extract keywords from query
        const keywords = this.extractKeywords(query);

        // For now, we'll simulate keyword search by filtering vector results
        // In a production system, this would use a full-text search engine like Elasticsearch
        const allResults = await this.vectorDb.searchVectors(
            new Array(384).fill(0), // Dummy vector for getting all results
            { ...options, topK: options.topK * 3 } // Get more results for filtering
        );

        const keywordResults: RankedSearchResult[] = allResults
            .map(result => {
                const keywordScore = this.calculateKeywordScore(keywords, result.metadata, options.keywordBoost);
                return {
                    ...result,
                    vectorScore: result.score,
                    keywordScore,
                    finalScore: keywordScore,
                    rankingFactors: {
                        semantic: result.score,
                        keyword: keywordScore,
                        metadata: 0,
                        recency: 0
                    }
                };
            })
            .filter(result => (result.keywordScore ?? 0) > 0)
            .sort((a, b) => (b.keywordScore ?? 0) - (a.keywordScore ?? 0));

        return keywordResults.slice(0, options.topK);
    }

    private extractKeywords(query: string): string[] {
        // Simple keyword extraction - in production, use more sophisticated NLP
        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !this.isStopWord(word));
    }

    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
        ]);
        return stopWords.has(word.toLowerCase());
    }

    private calculateKeywordScore(
        keywords: string[],
        metadata: Record<string, any>,
        keywordBoost?: Record<string, number>
    ): number {
        let score = 0;
        const text = JSON.stringify(metadata).toLowerCase();

        for (const keyword of keywords) {
            const occurrences = (text.match(new RegExp(keyword, 'g')) || []).length;
            const boost = keywordBoost?.[keyword] ?? 1;
            score += occurrences * boost;
        }

        // Normalize score
        return Math.min(score / (keywords.length * 10), 1);
    }

    private combineSearchResults(
        semanticResults: RankedSearchResult[],
        keywordResults: RankedSearchResult[],
        vectorWeight: number,
        keywordWeight: number
    ): RankedSearchResult[] {
        const resultMap = new Map<string, RankedSearchResult>();

        // Add semantic results
        for (const result of semanticResults) {
            resultMap.set(result.id, {
                ...result,
                finalScore: result.vectorScore * vectorWeight,
                rankingFactors: {
                    ...result.rankingFactors,
                    semantic: result.vectorScore * vectorWeight
                }
            });
        }

        // Merge keyword results
        for (const result of keywordResults) {
            const existing = resultMap.get(result.id);
            const keywordScore = result.keywordScore ?? 0;
            if (existing) {
                // Combine scores
                existing.keywordScore = keywordScore;
                existing.finalScore = (existing.vectorScore * vectorWeight) + (keywordScore * keywordWeight);
                existing.rankingFactors.keyword = keywordScore * keywordWeight;
            } else {
                // Add as keyword-only result
                resultMap.set(result.id, {
                    ...result,
                    keywordScore,
                    finalScore: keywordScore * keywordWeight,
                    rankingFactors: {
                        semantic: 0,
                        keyword: keywordScore * keywordWeight,
                        metadata: 0,
                        recency: 0
                    }
                });
            }
        }

        // Sort by final score
        return Array.from(resultMap.values())
            .sort((a, b) => b.finalScore - a.finalScore);
    }

    private applyRankingFactors(
        results: RankedSearchResult[],
        query: string,
        _options: SearchOptions
    ): RankedSearchResult[] {
        return results.map(result => {
            let finalScore = result.vectorScore;
            const factors = { ...result.rankingFactors };

            // Apply metadata boost
            const metadataBoost = this.calculateMetadataBoost(result.metadata, query);
            factors.metadata = metadataBoost;
            finalScore += metadataBoost * 0.1;

            // Apply recency boost
            const recencyBoost = this.calculateRecencyBoost(result.metadata);
            factors.recency = recencyBoost;
            finalScore += recencyBoost * 0.05;

            return {
                ...result,
                finalScore: Math.min(finalScore, 1),
                rankingFactors: factors
            };
        }).sort((a, b) => b.finalScore - a.finalScore);
    }

    private calculateMetadataBoost(metadata: Record<string, any>, query: string): number {
        let boost = 0;

        // Title match boost
        if (metadata.title && typeof metadata.title === 'string') {
            const titleMatch = metadata.title.toLowerCase().includes(query.toLowerCase());
            if (titleMatch) boost += 0.3;
        }

        // Category/tag boost
        if (metadata.category || metadata.tags) {
            const categoryText = [metadata.category, ...(metadata.tags || [])].join(' ').toLowerCase();
            if (categoryText.includes(query.toLowerCase())) {
                boost += 0.2;
            }
        }

        return Math.min(boost, 0.5);
    }

    private calculateRecencyBoost(metadata: Record<string, any>): number {
        const now = new Date();
        const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : null;
        const modifiedAt = metadata.modifiedAt ? new Date(metadata.modifiedAt) : null;

        const relevantDate = modifiedAt || createdAt;
        if (!relevantDate) return 0;

        const daysDiff = (now.getTime() - relevantDate.getTime()) / (1000 * 60 * 60 * 24);

        // Boost recent content (within 30 days)
        if (daysDiff <= 30) {
            return Math.max(0, (30 - daysDiff) / 30 * 0.2);
        }

        return 0;
    }

    private async rerankResults(
        results: RankedSearchResult[],
        _query: string,
        options: HybridSearchOptions
    ): Promise<RankedSearchResult[]> {
        // Advanced reranking using cross-encoder or similar
        // For now, implement a simple diversity-based reranking
        const reranked: RankedSearchResult[] = [];
        const used = new Set<string>();

        // First, add the top result
        if (results.length > 0) {
            reranked.push(results[0]!);
            used.add(results[0]!.id);
        }

        // Then add diverse results
        for (const result of results.slice(1)) {
            if (reranked.length >= options.topK) break;

            // Check diversity (simple implementation)
            const isDiverse = this.isDiverseResult(result, reranked);
            if (isDiverse && !used.has(result.id)) {
                reranked.push(result);
                used.add(result.id);
            }
        }

        // Fill remaining slots with highest scoring results
        for (const result of results) {
            if (reranked.length >= options.topK) break;
            if (!used.has(result.id)) {
                reranked.push(result);
                used.add(result.id);
            }
        }

        return reranked;
    }

    private isDiverseResult(result: RankedSearchResult, existing: RankedSearchResult[]): boolean {
        // Simple diversity check based on metadata
        for (const existingResult of existing) {
            // Check if from same source
            if (result.metadata.sourceId === existingResult.metadata.sourceId) {
                return false;
            }

            // Check if similar category
            if (result.metadata.category &&
                result.metadata.category === existingResult.metadata.category) {
                return false;
            }
        }

        return true;
    }

    public async getSearchStats(): Promise<{
        totalVectors: number;
        averageResponseTime: number;
        cacheHitRate: number;
        lastOptimized: Date;
    }> {
        const indexStats = await this.vectorDb.getIndexStats();

        return {
            totalVectors: indexStats.totalVectors,
            averageResponseTime: 0, // Would be tracked in production
            cacheHitRate: 0, // Would be tracked in production
            lastOptimized: indexStats.lastUpdated
        };
    }

    public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: object }> {
        try {
            const vectorDbHealth = await this.vectorDb.healthCheck();
            const embeddingHealth = this.embeddingService ?
                await this.embeddingService.healthCheck() :
                { status: 'unhealthy', details: { error: 'Embedding service not configured' } };

            const isHealthy = vectorDbHealth.status === 'healthy' && embeddingHealth.status === 'healthy';

            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                details: {
                    vectorDatabase: vectorDbHealth,
                    embeddingService: embeddingHealth,
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

export class VectorDatabase {
    private config: VectorDatabaseConfig;
    private faissIndex?: IndexFlatL2;
    private qdrantClient?: QdrantClient;
    private pineconeClient?: PineconeClient;
    private vectorStore: Map<string, VectorRecord> = new Map();
    private isInitialized: boolean = false;

    constructor(config: VectorDatabaseConfig) {
        this.config = {
            metricType: 'l2',
            timeout: 30000,
            indexType: 'flat',
            nlist: 100,
            ...config
        };
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    await this.initializeFaiss();
                    break;
                case 'qdrant':
                    await this.initializeQdrant();
                    break;
                case 'pinecone':
                    await this.initializePinecone();
                    break;
                default:
                    throw new ValidationError(`Unsupported vector database provider: ${this.config.provider}`);
            }

            this.isInitialized = true;
        } catch (error) {
            throw new DataSourceError(
                `Failed to initialize vector database: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'VECTOR_DB_INIT_ERROR'
            );
        }
    }

    private async initializeFaiss(): Promise<void> {
        try {
            // For now, only support flat index due to faiss-node limitations
            this.faissIndex = new IndexFlatL2(this.config.dimension);
        } catch (error) {
            throw new DataSourceError(
                `Failed to initialize FAISS index: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'FAISS_INIT_ERROR'
            );
        }
    }

    private async initializeQdrant(): Promise<void> {
        if (!this.config.connectionString) {
            throw new ValidationError('Qdrant connection string is required');
        }

        try {
            this.qdrantClient = new QdrantClient({
                url: this.config.connectionString,
                apiKey: this.config.apiKey
            });

            // Test connection
            await this.qdrantClient.getCollections();
        } catch (error) {
            throw new DataSourceError(
                `Failed to connect to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'QDRANT_CONNECTION_ERROR'
            );
        }
    }

    private async initializePinecone(): Promise<void> {
        if (!this.config.apiKey || !this.config.environment) {
            throw new ValidationError('Pinecone API key and environment are required');
        }

        try {
            this.pineconeClient = new PineconeClient();
            await this.pineconeClient.init({
                apiKey: this.config.apiKey,
                environment: this.config.environment
            });
        } catch (error) {
            throw new DataSourceError(
                `Failed to initialize Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'PINECONE_INIT_ERROR'
            );
        }
    }

    public async storeVectors(vectors: VectorRecord[]): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    await this.storeFaissVectors(vectors);
                    break;
                case 'qdrant':
                    await this.storeQdrantVectors(vectors);
                    break;
                case 'pinecone':
                    await this.storePineconeVectors(vectors);
                    break;
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to store vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'VECTOR_STORE_ERROR'
            );
        }
    }

    private async storeFaissVectors(vectors: VectorRecord[]): Promise<void> {
        if (!this.faissIndex) {
            throw new DataSourceError('FAISS index not initialized', 'FAISS_NOT_INITIALIZED');
        }

        const vectorData = vectors.map(v => v.vector);
        const vectorMatrix = vectorData.flat();

        this.faissIndex.add(vectorMatrix);

        // Store metadata separately
        vectors.forEach(vector => {
            this.vectorStore.set(vector.id, vector);
        });
    }

    private async storeQdrantVectors(vectors: VectorRecord[]): Promise<void> {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }

        const points = vectors.map(vector => ({
            id: vector.id,
            vector: vector.vector,
            payload: vector.metadata
        }));

        await this.qdrantClient.upsert(this.config.indexName, {
            wait: true,
            points
        });
    }

    private async storePineconeVectors(vectors: VectorRecord[]): Promise<void> {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
        }

        const index = this.pineconeClient.Index(this.config.indexName);

        const upsertRequest = {
            vectors: vectors.map(vector => ({
                id: vector.id,
                values: vector.vector,
                metadata: vector.metadata
            }))
        };

        await index.upsert({ upsertRequest });
    }

    public async searchVectors(
        queryVector: number[],
        options: SearchOptions
    ): Promise<SearchResult[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    return await this.searchFaissVectors(queryVector, options);
                case 'qdrant':
                    return await this.searchQdrantVectors(queryVector, options);
                case 'pinecone':
                    return await this.searchPineconeVectors(queryVector, options);
                default:
                    throw new ValidationError(`Unsupported provider: ${this.config.provider}`);
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to search vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'VECTOR_SEARCH_ERROR'
            );
        }
    }

    private async searchFaissVectors(
        queryVector: number[],
        options: SearchOptions
    ): Promise<SearchResult[]> {
        if (!this.faissIndex) {
            throw new DataSourceError('FAISS index not initialized', 'FAISS_NOT_INITIALIZED');
        }

        const searchResult = this.faissIndex.search(queryVector, options.topK);

        const results: SearchResult[] = [];
        const vectorArray = Array.from(this.vectorStore.values());

        for (let i = 0; i < searchResult.labels.length; i++) {
            const label = searchResult.labels[i];
            const distance = searchResult.distances[i];

            if (label !== undefined && distance !== undefined && label >= 0 && label < vectorArray.length) {
                const vector = vectorArray[label];
                if (vector && (!options.threshold || distance <= options.threshold)) {
                    results.push({
                        id: vector.id,
                        score: 1 / (1 + distance), // Convert distance to similarity score
                        metadata: options.includeMetadata ? vector.metadata : {}
                    });
                }
            }
        }

        return results;
    }

    private async searchQdrantVectors(
        queryVector: number[],
        options: SearchOptions
    ): Promise<SearchResult[]> {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }

        const searchResult = await this.qdrantClient.search(this.config.indexName, {
            vector: queryVector,
            limit: options.topK,
            filter: options.filter,
            with_payload: options.includeMetadata,
            score_threshold: options.threshold
        });

        return searchResult.map(point => ({
            id: point.id.toString(),
            score: point.score,
            metadata: point.payload || {}
        }));
    }

    private async searchPineconeVectors(
        queryVector: number[],
        options: SearchOptions
    ): Promise<SearchResult[]> {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
        }

        const index = this.pineconeClient.Index(this.config.indexName);

        const queryRequest = {
            vector: queryVector,
            topK: options.topK,
            includeMetadata: options.includeMetadata,
            filter: options.filter
        };

        const searchResult = await index.query({ queryRequest });

        return (searchResult.matches || [])
            .filter(match => !options.threshold || (match.score !== undefined && match.score >= options.threshold))
            .map(match => ({
                id: match.id,
                score: match.score || 0,
                metadata: match.metadata || {}
            }));
    }

    public async updateVectors(vectors: VectorRecord[]): Promise<void> {
        // For most vector databases, update is the same as upsert
        await this.storeVectors(vectors);
    }

    public async deleteVectors(ids: string[]): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    await this.deleteFaissVectors(ids);
                    break;
                case 'qdrant':
                    await this.deleteQdrantVectors(ids);
                    break;
                case 'pinecone':
                    await this.deletePineconeVectors(ids);
                    break;
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'VECTOR_DELETE_ERROR'
            );
        }
    }

    private async deleteFaissVectors(ids: string[]): Promise<void> {
        // FAISS doesn't support direct deletion, so we remove from our metadata store
        // In a production system, you'd need to rebuild the index
        ids.forEach(id => {
            this.vectorStore.delete(id);
        });
    }

    private async deleteQdrantVectors(ids: string[]): Promise<void> {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }

        await this.qdrantClient.delete(this.config.indexName, {
            wait: true,
            points: ids
        });
    }

    private async deletePineconeVectors(ids: string[]): Promise<void> {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
        }

        const index = this.pineconeClient.Index(this.config.indexName);
        await index.delete1({ ids });
    }

    public async optimizeIndex(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    await this.optimizeFaissIndex();
                    break;
                case 'qdrant':
                    await this.optimizeQdrantIndex();
                    break;
                case 'pinecone':
                    // Pinecone handles optimization automatically
                    break;
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to optimize index: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'INDEX_OPTIMIZATION_ERROR'
            );
        }
    }

    private async optimizeFaissIndex(): Promise<void> {
        if (!this.faissIndex) {
            return;
        }

        // For flat indexes, no optimization is needed
        // In a production system, you might implement index rebuilding here
    }

    private async optimizeQdrantIndex(): Promise<void> {
        if (!this.qdrantClient || !this.config.indexName) {
            return;
        }

        // Trigger optimization in Qdrant
        try {
            await this.qdrantClient.updateCollection(this.config.indexName, {
                optimizers_config: {
                    default_segment_number: 2
                }
            });
        } catch (error) {
            // Optimization is optional, so we don't throw on failure
            console.warn(`Qdrant optimization warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async getIndexStats(): Promise<IndexStats> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            switch (this.config.provider) {
                case 'faiss':
                    return await this.getFaissStats();
                case 'qdrant':
                    return await this.getQdrantStats();
                case 'pinecone':
                    return await this.getPineconeStats();
                default:
                    throw new ValidationError(`Unsupported provider: ${this.config.provider}`);
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'INDEX_STATS_ERROR'
            );
        }
    }

    private async getFaissStats(): Promise<IndexStats> {
        const indexTotal = this.faissIndex?.ntotal;
        const totalVectors = typeof indexTotal === 'number' ? indexTotal : this.vectorStore.size;

        return {
            totalVectors,
            dimension: this.config.dimension,
            indexType: this.config.indexType || 'flat',
            memoryUsage: totalVectors * this.config.dimension * 4, // 4 bytes per float
            lastUpdated: new Date()
        };
    }

    private async getQdrantStats(): Promise<IndexStats> {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }

        const collectionInfo = await this.qdrantClient.getCollection(this.config.indexName);

        return {
            totalVectors: collectionInfo.points_count || 0,
            dimension: this.config.dimension,
            indexType: 'qdrant',
            lastUpdated: new Date()
        };
    }

    private async getPineconeStats(): Promise<IndexStats> {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
        }

        const index = this.pineconeClient.Index(this.config.indexName);
        const stats = await index.describeIndexStats({
            describeIndexStatsRequest: {}
        });

        return {
            totalVectors: stats.totalVectorCount || 0,
            dimension: this.config.dimension,
            indexType: 'pinecone',
            lastUpdated: new Date()
        };
    }

    public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: object }> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const stats = await this.getIndexStats();

            return {
                status: 'healthy',
                details: {
                    provider: this.config.provider,
                    indexName: this.config.indexName,
                    dimension: this.config.dimension,
                    totalVectors: stats.totalVectors,
                    indexType: stats.indexType,
                    lastCheck: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    provider: this.config.provider,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }

    public getConfig(): VectorDatabaseConfig {
        return { ...this.config };
    }

    public async close(): Promise<void> {
        // Clean up resources
        this.vectorStore.clear();
        this.isInitialized = false;

        // Provider-specific cleanup would go here
        if (this.config.provider === 'qdrant' && this.qdrantClient) {
            // Qdrant client cleanup if needed
        }

        if (this.config.provider === 'pinecone' && this.pineconeClient) {
            // Pinecone client cleanup if needed
        }
    }
}
