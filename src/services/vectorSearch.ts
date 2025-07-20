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
