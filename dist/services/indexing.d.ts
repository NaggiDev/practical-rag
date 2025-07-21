import Redis from 'ioredis';
import { Content, ContentChange } from '../models/content';
import { EmbeddingService } from './embedding';
export interface IndexingConfig {
    chunkSize: number;
    chunkOverlap: number;
    minChunkSize: number;
    maxChunkSize: number;
    enableMetadataExtraction: boolean;
    batchSize: number;
    concurrency: number;
}
export interface ChunkingStrategy {
    name: string;
    chunkText(text: string, config: IndexingConfig): TextChunk[];
}
export interface TextChunk {
    text: string;
    startIndex: number;
    endIndex: number;
    metadata?: Record<string, any>;
}
export interface IndexingResult {
    contentId: string;
    chunksCreated: number;
    embeddingsGenerated: number;
    processingTime: number;
    status: 'success' | 'partial' | 'failed';
    errors?: string[];
}
export interface BatchIndexingResult {
    totalProcessed: number;
    successful: number;
    failed: number;
    results: IndexingResult[];
    totalProcessingTime: number;
}
export declare class IndexingService {
    private config;
    private embeddingService;
    private redis?;
    private chunkingStrategies;
    constructor(config: Partial<IndexingConfig>, embeddingService: EmbeddingService, redis?: Redis);
    private initializeChunkingStrategies;
    indexContent(content: Content, strategy?: string): Promise<IndexingResult>;
    batchIndexContent(contents: Content[], strategy?: string): Promise<BatchIndexingResult>;
    updateIndex(sourceId: string, changes: ContentChange[]): Promise<BatchIndexingResult>;
    private extractMetadata;
    private detectLanguage;
    private extractKeywords;
    private extractEntities;
    private hasContentChanged;
    private hashContent;
    private storeIndexingMetadata;
    private recordContentChange;
    private removeFromIndex;
    getConfig(): IndexingConfig;
    getAvailableStrategies(): string[];
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: object;
    }>;
}
//# sourceMappingURL=indexing.d.ts.map