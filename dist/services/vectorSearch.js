"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorDatabase = exports.VectorSearchEngine = void 0;
const pinecone_1 = require("@pinecone-database/pinecone");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const faiss_node_1 = require("faiss-node");
const errors_1 = require("../utils/errors");
class VectorSearchEngine {
    constructor(vectorDb, embeddingService) {
        this.isInitialized = false;
        this.vectorDb = vectorDb;
        this.embeddingService = embeddingService;
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        await this.vectorDb.initialize();
        this.isInitialized = true;
    }
    async semanticSearch(query, options) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        if (!this.embeddingService) {
            throw new errors_1.DataSourceError('Embedding service not configured', 'EMBEDDING_SERVICE_MISSING');
        }
        try {
            const embeddingResult = await this.embeddingService.generateEmbedding(query);
            const queryVector = embeddingResult.embedding;
            const vectorResults = await this.vectorDb.searchVectors(queryVector, options);
            const rankedResults = vectorResults.map(result => ({
                ...result,
                vectorScore: result.score,
                finalScore: result.score,
                rankingFactors: {
                    semantic: result.score,
                    metadata: 0,
                    recency: 0
                }
            }));
            return this.applyRankingFactors(rankedResults, query, options);
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'SEMANTIC_SEARCH_ERROR');
        }
    }
    async hybridSearch(query, options) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        try {
            const vectorWeight = options.vectorWeight ?? 0.7;
            const keywordWeight = options.keywordWeight ?? 0.3;
            const semanticResults = await this.semanticSearch(query, options);
            const keywordResults = await this.keywordSearch(query, options);
            const combinedResults = this.combineSearchResults(semanticResults, keywordResults, vectorWeight, keywordWeight);
            if (options.rerankResults) {
                return this.rerankResults(combinedResults, query, options);
            }
            return combinedResults.slice(0, options.topK);
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'HYBRID_SEARCH_ERROR');
        }
    }
    async keywordSearch(query, options) {
        const keywords = this.extractKeywords(query);
        const allResults = await this.vectorDb.searchVectors(new Array(384).fill(0), { ...options, topK: options.topK * 3 });
        const keywordResults = allResults
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
    extractKeywords(query) {
        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !this.isStopWord(word));
    }
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
        ]);
        return stopWords.has(word.toLowerCase());
    }
    calculateKeywordScore(keywords, metadata, keywordBoost) {
        let score = 0;
        const text = JSON.stringify(metadata).toLowerCase();
        for (const keyword of keywords) {
            const occurrences = (text.match(new RegExp(keyword, 'g')) || []).length;
            const boost = keywordBoost?.[keyword] ?? 1;
            score += occurrences * boost;
        }
        return Math.min(score / (keywords.length * 10), 1);
    }
    combineSearchResults(semanticResults, keywordResults, vectorWeight, keywordWeight) {
        const resultMap = new Map();
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
        for (const result of keywordResults) {
            const existing = resultMap.get(result.id);
            const keywordScore = result.keywordScore ?? 0;
            if (existing) {
                existing.keywordScore = keywordScore;
                existing.finalScore = (existing.vectorScore * vectorWeight) + (keywordScore * keywordWeight);
                existing.rankingFactors.keyword = keywordScore * keywordWeight;
            }
            else {
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
        return Array.from(resultMap.values())
            .sort((a, b) => b.finalScore - a.finalScore);
    }
    applyRankingFactors(results, query, _options) {
        return results.map(result => {
            let finalScore = result.vectorScore;
            const factors = { ...result.rankingFactors };
            const metadataBoost = this.calculateMetadataBoost(result.metadata, query);
            factors.metadata = metadataBoost;
            finalScore += metadataBoost * 0.1;
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
    calculateMetadataBoost(metadata, query) {
        let boost = 0;
        if (metadata.title && typeof metadata.title === 'string') {
            const titleMatch = metadata.title.toLowerCase().includes(query.toLowerCase());
            if (titleMatch)
                boost += 0.3;
        }
        if (metadata.category || metadata.tags) {
            const categoryText = [metadata.category, ...(metadata.tags || [])].join(' ').toLowerCase();
            if (categoryText.includes(query.toLowerCase())) {
                boost += 0.2;
            }
        }
        return Math.min(boost, 0.5);
    }
    calculateRecencyBoost(metadata) {
        const now = new Date();
        const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : null;
        const modifiedAt = metadata.modifiedAt ? new Date(metadata.modifiedAt) : null;
        const relevantDate = modifiedAt || createdAt;
        if (!relevantDate)
            return 0;
        const daysDiff = (now.getTime() - relevantDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 30) {
            return Math.max(0, (30 - daysDiff) / 30 * 0.2);
        }
        return 0;
    }
    async rerankResults(results, _query, options) {
        const reranked = [];
        const used = new Set();
        if (results.length > 0) {
            reranked.push(results[0]);
            used.add(results[0].id);
        }
        for (const result of results.slice(1)) {
            if (reranked.length >= options.topK)
                break;
            const isDiverse = this.isDiverseResult(result, reranked);
            if (isDiverse && !used.has(result.id)) {
                reranked.push(result);
                used.add(result.id);
            }
        }
        for (const result of results) {
            if (reranked.length >= options.topK)
                break;
            if (!used.has(result.id)) {
                reranked.push(result);
                used.add(result.id);
            }
        }
        return reranked;
    }
    isDiverseResult(result, existing) {
        for (const existingResult of existing) {
            if (result.metadata.sourceId === existingResult.metadata.sourceId) {
                return false;
            }
            if (result.metadata.category &&
                result.metadata.category === existingResult.metadata.category) {
                return false;
            }
        }
        return true;
    }
    async getSearchStats() {
        const indexStats = await this.vectorDb.getIndexStats();
        return {
            totalVectors: indexStats.totalVectors,
            averageResponseTime: 0,
            cacheHitRate: 0,
            lastOptimized: indexStats.lastUpdated
        };
    }
    async healthCheck() {
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
exports.VectorSearchEngine = VectorSearchEngine;
class VectorDatabase {
    constructor(config) {
        this.vectorStore = new Map();
        this.isInitialized = false;
        this.config = {
            metricType: 'l2',
            timeout: 30000,
            indexType: 'flat',
            nlist: 100,
            ...config
        };
    }
    async initialize() {
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
                    throw new errors_1.ValidationError(`Unsupported vector database provider: ${this.config.provider}`);
            }
            this.isInitialized = true;
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to initialize vector database: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VECTOR_DB_INIT_ERROR');
        }
    }
    async initializeFaiss() {
        try {
            this.faissIndex = new faiss_node_1.IndexFlatL2(this.config.dimension);
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to initialize FAISS index: ${error instanceof Error ? error.message : 'Unknown error'}`, 'FAISS_INIT_ERROR');
        }
    }
    async initializeQdrant() {
        if (!this.config.connectionString) {
            throw new errors_1.ValidationError('Qdrant connection string is required');
        }
        try {
            this.qdrantClient = new js_client_rest_1.QdrantClient({
                url: this.config.connectionString,
                apiKey: this.config.apiKey
            });
            await this.qdrantClient.getCollections();
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to connect to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QDRANT_CONNECTION_ERROR');
        }
    }
    async initializePinecone() {
        if (!this.config.apiKey || !this.config.environment) {
            throw new errors_1.ValidationError('Pinecone API key and environment are required');
        }
        try {
            this.pineconeClient = new pinecone_1.PineconeClient();
            await this.pineconeClient.init({
                apiKey: this.config.apiKey,
                environment: this.config.environment
            });
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to initialize Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`, 'PINECONE_INIT_ERROR');
        }
    }
    async storeVectors(vectors) {
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
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to store vectors: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VECTOR_STORE_ERROR');
        }
    }
    async storeFaissVectors(vectors) {
        if (!this.faissIndex) {
            throw new errors_1.DataSourceError('FAISS index not initialized', 'FAISS_NOT_INITIALIZED');
        }
        const vectorData = vectors.map(v => v.vector);
        const vectorMatrix = vectorData.flat();
        this.faissIndex.add(vectorMatrix);
        vectors.forEach(vector => {
            this.vectorStore.set(vector.id, vector);
        });
    }
    async storeQdrantVectors(vectors) {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
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
    async storePineconeVectors(vectors) {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
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
    async searchVectors(queryVector, options) {
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
                    throw new errors_1.ValidationError(`Unsupported provider: ${this.config.provider}`);
            }
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to search vectors: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VECTOR_SEARCH_ERROR');
        }
    }
    async searchFaissVectors(queryVector, options) {
        if (!this.faissIndex) {
            throw new errors_1.DataSourceError('FAISS index not initialized', 'FAISS_NOT_INITIALIZED');
        }
        const searchResult = this.faissIndex.search(queryVector, options.topK);
        const results = [];
        const vectorArray = Array.from(this.vectorStore.values());
        for (let i = 0; i < searchResult.labels.length; i++) {
            const label = searchResult.labels[i];
            const distance = searchResult.distances[i];
            if (label !== undefined && distance !== undefined && label >= 0 && label < vectorArray.length) {
                const vector = vectorArray[label];
                if (vector && (!options.threshold || distance <= options.threshold)) {
                    results.push({
                        id: vector.id,
                        score: 1 / (1 + distance),
                        metadata: options.includeMetadata ? vector.metadata : {}
                    });
                }
            }
        }
        return results;
    }
    async searchQdrantVectors(queryVector, options) {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
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
    async searchPineconeVectors(queryVector, options) {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
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
    async updateVectors(vectors) {
        await this.storeVectors(vectors);
    }
    async deleteVectors(ids) {
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
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VECTOR_DELETE_ERROR');
        }
    }
    async deleteFaissVectors(ids) {
        ids.forEach(id => {
            this.vectorStore.delete(id);
        });
    }
    async deleteQdrantVectors(ids) {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }
        await this.qdrantClient.delete(this.config.indexName, {
            wait: true,
            points: ids
        });
    }
    async deletePineconeVectors(ids) {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
        }
        const index = this.pineconeClient.Index(this.config.indexName);
        await index.delete1({ ids });
    }
    async optimizeIndex() {
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
                    break;
            }
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to optimize index: ${error instanceof Error ? error.message : 'Unknown error'}`, 'INDEX_OPTIMIZATION_ERROR');
        }
    }
    async optimizeFaissIndex() {
        if (!this.faissIndex) {
            return;
        }
    }
    async optimizeQdrantIndex() {
        if (!this.qdrantClient || !this.config.indexName) {
            return;
        }
        try {
            await this.qdrantClient.updateCollection(this.config.indexName, {
                optimizers_config: {
                    default_segment_number: 2
                }
            });
        }
        catch (error) {
            console.warn(`Qdrant optimization warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getIndexStats() {
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
                    throw new errors_1.ValidationError(`Unsupported provider: ${this.config.provider}`);
            }
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`, 'INDEX_STATS_ERROR');
        }
    }
    async getFaissStats() {
        const indexTotal = this.faissIndex?.ntotal;
        const totalVectors = typeof indexTotal === 'number' ? indexTotal : this.vectorStore.size;
        return {
            totalVectors,
            dimension: this.config.dimension,
            indexType: this.config.indexType || 'flat',
            memoryUsage: totalVectors * this.config.dimension * 4,
            lastUpdated: new Date()
        };
    }
    async getQdrantStats() {
        if (!this.qdrantClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Qdrant client or index name not configured', 'QDRANT_NOT_CONFIGURED');
        }
        const collectionInfo = await this.qdrantClient.getCollection(this.config.indexName);
        return {
            totalVectors: collectionInfo.points_count || 0,
            dimension: this.config.dimension,
            indexType: 'qdrant',
            lastUpdated: new Date()
        };
    }
    async getPineconeStats() {
        if (!this.pineconeClient || !this.config.indexName) {
            throw new errors_1.DataSourceError('Pinecone client or index name not configured', 'PINECONE_NOT_CONFIGURED');
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
    async healthCheck() {
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
        }
        catch (error) {
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
    getConfig() {
        return { ...this.config };
    }
    async close() {
        this.vectorStore.clear();
        this.isInitialized = false;
        if (this.config.provider === 'qdrant' && this.qdrantClient) {
        }
        if (this.config.provider === 'pinecone' && this.pineconeClient) {
        }
    }
}
exports.VectorDatabase = VectorDatabase;
//# sourceMappingURL=vectorSearch.js.map