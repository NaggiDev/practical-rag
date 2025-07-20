import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Content, ContentChange, ContentChunk, ContentChunkModel, ContentModel, IndexedContent } from '../models/content';
import { DataSourceError, ValidationError } from '../utils/errors';
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

export class IndexingService {
    private config: IndexingConfig;
    private embeddingService: EmbeddingService;
    private redis?: Redis;
    private chunkingStrategies: Map<string, ChunkingStrategy>;

    constructor(
        config: Partial<IndexingConfig>,
        embeddingService: EmbeddingService,
        redis?: Redis
    ) {
        this.config = {
            chunkSize: 1000,
            chunkOverlap: 200,
            minChunkSize: 100,
            maxChunkSize: 2000,
            enableMetadataExtraction: true,
            batchSize: 10,
            concurrency: 3,
            ...config
        };
        this.embeddingService = embeddingService;
        this.redis = redis;
        this.chunkingStrategies = new Map();
        this.initializeChunkingStrategies();
    }

    private initializeChunkingStrategies(): void {
        // Sliding window chunking strategy
        this.chunkingStrategies.set('sliding-window', {
            name: 'sliding-window',
            chunkText: (text: string, config: IndexingConfig): TextChunk[] => {
                const chunks: TextChunk[] = [];
                const chunkSize = config.chunkSize;
                const overlap = config.chunkOverlap;
                const step = chunkSize - overlap;

                for (let i = 0; i < text.length; i += step) {
                    const endIndex = Math.min(i + chunkSize, text.length);
                    const chunkText = text.slice(i, endIndex);

                    if (chunkText.length >= config.minChunkSize) {
                        chunks.push({
                            text: chunkText,
                            startIndex: i,
                            endIndex: endIndex,
                            metadata: {
                                chunkSize: chunkText.length,
                                overlap: i > 0 ? overlap : 0
                            }
                        });
                    }

                    if (endIndex >= text.length) break;
                }

                return chunks;
            }
        });

        // Sentence-based chunking strategy
        this.chunkingStrategies.set('sentence-based', {
            name: 'sentence-based',
            chunkText: (text: string, config: IndexingConfig): TextChunk[] => {
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
                const chunks: TextChunk[] = [];
                let currentChunk = '';
                let startIndex = 0;

                for (const sentence of sentences) {
                    const trimmedSentence = sentence.trim();
                    if (!trimmedSentence) continue;

                    const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;

                    if (potentialChunk.length > config.chunkSize && currentChunk.length > 0) {
                        // Create chunk from current content
                        if (currentChunk.length >= config.minChunkSize) {
                            const endIndex = startIndex + currentChunk.length;
                            chunks.push({
                                text: currentChunk,
                                startIndex,
                                endIndex,
                                metadata: {
                                    chunkSize: currentChunk.length,
                                    sentenceCount: currentChunk.split(/[.!?]+/).length - 1
                                }
                            });
                        }

                        // Start new chunk
                        startIndex = text.indexOf(trimmedSentence, startIndex);
                        currentChunk = trimmedSentence;
                    } else {
                        currentChunk = potentialChunk;
                    }
                }

                // Add final chunk
                if (currentChunk.length >= config.minChunkSize) {
                    chunks.push({
                        text: currentChunk,
                        startIndex,
                        endIndex: startIndex + currentChunk.length,
                        metadata: {
                            chunkSize: currentChunk.length,
                            sentenceCount: currentChunk.split(/[.!?]+/).length - 1
                        }
                    });
                }

                return chunks;
            }
        });
    }

    public async indexContent(
        content: Content,
        strategy: string = 'sliding-window'
    ): Promise<IndexingResult> {
        const startTime = Date.now();
        const errors: string[] = [];

        try {
            // Validate content
            const contentModel = new ContentModel(content);

            // Check if content has changed
            const hasChanged = await this.hasContentChanged(contentModel);
            if (!hasChanged) {
                return {
                    contentId: content.id,
                    chunksCreated: content.chunks.length,
                    embeddingsGenerated: 0,
                    processingTime: Date.now() - startTime,
                    status: 'success'
                };
            }

            // Extract metadata if enabled
            let extractedMetadata = content.metadata;
            if (this.config.enableMetadataExtraction) {
                extractedMetadata = await this.extractMetadata(content);
            }

            // Chunk the content
            const chunkingStrategy = this.chunkingStrategies.get(strategy);
            if (!chunkingStrategy) {
                throw new ValidationError(`Unknown chunking strategy: ${strategy}`);
            }

            const textChunks = chunkingStrategy.chunkText(content.text, this.config);

            // Generate embeddings for chunks
            const chunkTexts = textChunks.map(chunk => chunk.text);
            const embeddingResults = await this.embeddingService.batchEmbeddings(chunkTexts);

            // Create ContentChunk objects
            const contentChunks: ContentChunk[] = [];
            for (let i = 0; i < textChunks.length; i++) {
                const textChunk = textChunks[i]!;
                const embeddingResult = embeddingResults.results[i];

                if (!embeddingResult) {
                    errors.push(`Failed to generate embedding for chunk ${i}`);
                    continue;
                }

                const contentChunk = new ContentChunkModel({
                    text: textChunk.text,
                    embedding: embeddingResult.embedding,
                    position: i,
                    metadata: {
                        startIndex: textChunk.startIndex,
                        endIndex: textChunk.endIndex,
                        chunkSize: textChunk.text.length,
                        overlap: textChunk.metadata?.overlap || 0,
                        ...textChunk.metadata
                    }
                });

                contentChunks.push(contentChunk.toJSON());
            }

            // Generate embedding for full content
            const contentEmbedding = await this.embeddingService.generateEmbedding(content.text);

            // Create updated content with chunks and embeddings
            const indexedContent = new ContentModel({
                ...content,
                metadata: extractedMetadata,
                embedding: contentEmbedding.embedding,
                chunks: contentChunks,
                lastUpdated: new Date(),
                version: content.version + 1
            });

            // Store indexing metadata
            await this.storeIndexingMetadata(indexedContent.toJSON());

            const processingTime = Date.now() - startTime;
            const status = errors.length > 0 ? 'partial' : 'success';

            return {
                contentId: content.id,
                chunksCreated: contentChunks.length,
                embeddingsGenerated: contentChunks.length + 1, // chunks + full content
                processingTime,
                status,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            return {
                contentId: content.id,
                chunksCreated: 0,
                embeddingsGenerated: 0,
                processingTime,
                status: 'failed',
                errors: [errorMessage]
            };
        }
    }

    public async batchIndexContent(
        contents: Content[],
        strategy: string = 'sliding-window'
    ): Promise<BatchIndexingResult> {
        const startTime = Date.now();
        const results: IndexingResult[] = [];
        let successful = 0;
        let failed = 0;

        // Process in batches with concurrency control
        const batchSize = this.config.batchSize;
        for (let i = 0; i < contents.length; i += batchSize) {
            const batch = contents.slice(i, i + batchSize);
            const batchPromises = batch.map(content =>
                this.indexContent(content, strategy)
                    .then(result => {
                        if (result.status === 'failed') {
                            failed++;
                        } else {
                            successful++;
                        }
                        return result;
                    })
                    .catch(error => {
                        failed++;
                        return {
                            contentId: content.id,
                            chunksCreated: 0,
                            embeddingsGenerated: 0,
                            processingTime: 0,
                            status: 'failed' as const,
                            errors: [error instanceof Error ? error.message : 'Unknown error']
                        };
                    })
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        const totalProcessingTime = Date.now() - startTime;

        return {
            totalProcessed: contents.length,
            successful,
            failed,
            results,
            totalProcessingTime
        };
    }

    public async updateIndex(
        sourceId: string,
        changes: ContentChange[]
    ): Promise<BatchIndexingResult> {
        const startTime = Date.now();
        const results: IndexingResult[] = [];
        let successful = 0;
        let failed = 0;

        // Filter changes for the specific source if needed
        const filteredChanges = sourceId ? changes : changes;

        for (const change of filteredChanges) {
            try {
                switch (change.changeType) {
                    case 'created':
                    case 'updated':
                        // For created/updated content, we need the actual content to index
                        // This would typically come from the data source manager
                        // For now, we'll just record the change
                        await this.recordContentChange(change);
                        successful++;
                        results.push({
                            contentId: change.contentId,
                            chunksCreated: 0,
                            embeddingsGenerated: 0,
                            processingTime: 0,
                            status: 'success'
                        });
                        break;

                    case 'deleted':
                        await this.removeFromIndex(change.contentId);
                        successful++;
                        results.push({
                            contentId: change.contentId,
                            chunksCreated: 0,
                            embeddingsGenerated: 0,
                            processingTime: 0,
                            status: 'success'
                        });
                        break;
                }
            } catch (error) {
                failed++;
                results.push({
                    contentId: change.contentId,
                    chunksCreated: 0,
                    embeddingsGenerated: 0,
                    processingTime: 0,
                    status: 'failed',
                    errors: [error instanceof Error ? error.message : 'Unknown error']
                });
            }
        }

        const totalProcessingTime = Date.now() - startTime;

        return {
            totalProcessed: changes.length,
            successful,
            failed,
            results,
            totalProcessingTime
        };
    }

    private async extractMetadata(content: Content): Promise<Record<string, any>> {
        const metadata = { ...content.metadata };

        try {
            // Extract basic text statistics
            metadata.wordCount = content.text.split(/\s+/).length;
            metadata.characterCount = content.text.length;
            metadata.sentenceCount = content.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
            metadata.paragraphCount = content.text.split(/\n\s*\n/).length;

            // Extract language (simple heuristic)
            metadata.language = this.detectLanguage(content.text);

            // Extract keywords (simple frequency-based)
            metadata.keywords = this.extractKeywords(content.text);

            // Extract entities (basic pattern matching)
            metadata.entities = this.extractEntities(content.text);

            return metadata;
        } catch (error) {
            // If metadata extraction fails, return original metadata
            console.warn(`Metadata extraction failed for content ${content.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return content.metadata;
        }
    }

    private detectLanguage(text: string): string {
        // Simple language detection based on common words
        const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const words = text.toLowerCase().split(/\s+/);
        const englishWordCount = words.filter(word => englishWords.includes(word)).length;
        const englishRatio = englishWordCount / Math.min(words.length, 100);

        return englishRatio > 0.1 ? 'en' : 'unknown';
    }

    private extractKeywords(text: string, maxKeywords: number = 10): string[] {
        // Simple keyword extraction based on word frequency
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);

        const wordFreq = new Map<string, number>();
        words.forEach(word => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });

        return Array.from(wordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);
    }

    private extractEntities(text: string): Record<string, string[]> {
        const entities: Record<string, string[]> = {
            emails: [],
            urls: [],
            dates: [],
            numbers: []
        };

        // Extract emails
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        entities.emails = text.match(emailRegex) || [];

        // Extract URLs
        const urlRegex = /https?:\/\/[^\s]+/g;
        entities.urls = text.match(urlRegex) || [];

        // Extract dates (simple patterns)
        const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
        entities.dates = text.match(dateRegex) || [];

        // Extract numbers
        const numberRegex = /\b\d+(?:\.\d+)?\b/g;
        entities.numbers = (text.match(numberRegex) || []).slice(0, 20); // Limit to first 20

        return entities;
    }

    private async hasContentChanged(content: ContentModel): Promise<boolean> {
        if (!this.redis) {
            return true; // Always process if no cache
        }

        try {
            const cacheKey = `content_hash:${content.id}`;
            const storedHash = await this.redis.get(cacheKey);
            const currentHash = this.hashContent(content.text);

            if (storedHash === currentHash) {
                return false;
            }

            // Store new hash
            await this.redis.set(cacheKey, currentHash, 'EX', 86400); // 24 hours
            return true;
        } catch (error) {
            // If cache fails, assume content has changed
            return true;
        }
    }

    private hashContent(text: string): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    private async storeIndexingMetadata(content: Content): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            const indexedContent: IndexedContent = {
                contentId: content.id,
                sourceId: content.sourceId,
                vectorId: uuidv4(),
                indexedAt: new Date(),
                status: 'indexed'
            };

            const cacheKey = `indexed_content:${content.id}`;
            await this.redis.setex(cacheKey, 86400, JSON.stringify(indexedContent));
        } catch (error) {
            console.warn(`Failed to store indexing metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async recordContentChange(change: ContentChange): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            const cacheKey = `content_change:${change.contentId}:${change.timestamp.getTime()}`;
            await this.redis.setex(cacheKey, 86400, JSON.stringify(change));
        } catch (error) {
            console.warn(`Failed to record content change: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async removeFromIndex(contentId: string): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            const keys = await this.redis.keys(`*${contentId}*`);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to remove content from index: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'INDEX_REMOVAL_ERROR'
            );
        }
    }

    public getConfig(): IndexingConfig {
        return { ...this.config };
    }

    public getAvailableStrategies(): string[] {
        return Array.from(this.chunkingStrategies.keys());
    }

    public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: object }> {
        try {
            // Check embedding service health
            const embeddingHealth = await this.embeddingService.healthCheck();

            if (embeddingHealth.status === 'unhealthy') {
                return {
                    status: 'unhealthy',
                    details: {
                        service: 'IndexingService',
                        embeddingService: embeddingHealth.details,
                        lastCheck: new Date().toISOString()
                    }
                };
            }

            return {
                status: 'healthy',
                details: {
                    service: 'IndexingService',
                    config: this.config,
                    availableStrategies: this.getAvailableStrategies(),
                    embeddingService: embeddingHealth.details,
                    lastCheck: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    service: 'IndexingService',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }
}
