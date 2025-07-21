"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexingService = void 0;
const uuid_1 = require("uuid");
const content_1 = require("../models/content");
const errors_1 = require("../utils/errors");
class IndexingService {
    constructor(config, embeddingService, redis) {
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
    initializeChunkingStrategies() {
        this.chunkingStrategies.set('sliding-window', {
            name: 'sliding-window',
            chunkText: (text, config) => {
                const chunks = [];
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
                    if (endIndex >= text.length)
                        break;
                }
                return chunks;
            }
        });
        this.chunkingStrategies.set('sentence-based', {
            name: 'sentence-based',
            chunkText: (text, config) => {
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
                const chunks = [];
                let currentChunk = '';
                let startIndex = 0;
                for (const sentence of sentences) {
                    const trimmedSentence = sentence.trim();
                    if (!trimmedSentence)
                        continue;
                    const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;
                    if (potentialChunk.length > config.chunkSize && currentChunk.length > 0) {
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
                        startIndex = text.indexOf(trimmedSentence, startIndex);
                        currentChunk = trimmedSentence;
                    }
                    else {
                        currentChunk = potentialChunk;
                    }
                }
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
    async indexContent(content, strategy = 'sliding-window') {
        const startTime = Date.now();
        const errors = [];
        try {
            const contentModel = new content_1.ContentModel(content);
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
            let extractedMetadata = content.metadata;
            if (this.config.enableMetadataExtraction) {
                extractedMetadata = await this.extractMetadata(content);
            }
            const chunkingStrategy = this.chunkingStrategies.get(strategy);
            if (!chunkingStrategy) {
                throw new errors_1.ValidationError(`Unknown chunking strategy: ${strategy}`);
            }
            const textChunks = chunkingStrategy.chunkText(content.text, this.config);
            const chunkTexts = textChunks.map(chunk => chunk.text);
            const embeddingResults = await this.embeddingService.batchEmbeddings(chunkTexts);
            const contentChunks = [];
            for (let i = 0; i < textChunks.length; i++) {
                const textChunk = textChunks[i];
                const embeddingResult = embeddingResults.results[i];
                if (!embeddingResult) {
                    errors.push(`Failed to generate embedding for chunk ${i}`);
                    continue;
                }
                const contentChunk = new content_1.ContentChunkModel({
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
            const contentEmbedding = await this.embeddingService.generateEmbedding(content.text);
            const indexedContent = new content_1.ContentModel({
                ...content,
                metadata: extractedMetadata,
                embedding: contentEmbedding.embedding,
                chunks: contentChunks,
                lastUpdated: new Date(),
                version: content.version + 1
            });
            await this.storeIndexingMetadata(indexedContent.toJSON());
            const processingTime = Date.now() - startTime;
            const status = errors.length > 0 ? 'partial' : 'success';
            return {
                contentId: content.id,
                chunksCreated: contentChunks.length,
                embeddingsGenerated: contentChunks.length + 1,
                processingTime,
                status,
                errors: errors.length > 0 ? errors : undefined
            };
        }
        catch (error) {
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
    async batchIndexContent(contents, strategy = 'sliding-window') {
        const startTime = Date.now();
        const results = [];
        let successful = 0;
        let failed = 0;
        const batchSize = this.config.batchSize;
        for (let i = 0; i < contents.length; i += batchSize) {
            const batch = contents.slice(i, i + batchSize);
            const batchPromises = batch.map(content => this.indexContent(content, strategy)
                .then(result => {
                if (result.status === 'failed') {
                    failed++;
                }
                else {
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
                    status: 'failed',
                    errors: [error instanceof Error ? error.message : 'Unknown error']
                };
            }));
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
    async updateIndex(sourceId, changes) {
        const startTime = Date.now();
        const results = [];
        let successful = 0;
        let failed = 0;
        const filteredChanges = sourceId ? changes : changes;
        for (const change of filteredChanges) {
            try {
                switch (change.changeType) {
                    case 'created':
                    case 'updated':
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
            }
            catch (error) {
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
    async extractMetadata(content) {
        const metadata = { ...content.metadata };
        try {
            metadata.wordCount = content.text.split(/\s+/).length;
            metadata.characterCount = content.text.length;
            metadata.sentenceCount = content.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
            metadata.paragraphCount = content.text.split(/\n\s*\n/).length;
            metadata.language = this.detectLanguage(content.text);
            metadata.keywords = this.extractKeywords(content.text);
            metadata.entities = this.extractEntities(content.text);
            return metadata;
        }
        catch (error) {
            console.warn(`Metadata extraction failed for content ${content.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return content.metadata;
        }
    }
    detectLanguage(text) {
        const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const words = text.toLowerCase().split(/\s+/);
        const englishWordCount = words.filter(word => englishWords.includes(word)).length;
        const englishRatio = englishWordCount / Math.min(words.length, 100);
        return englishRatio > 0.1 ? 'en' : 'unknown';
    }
    extractKeywords(text, maxKeywords = 10) {
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
        const wordFreq = new Map();
        words.forEach(word => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });
        return Array.from(wordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);
    }
    extractEntities(text) {
        const entities = {
            emails: [],
            urls: [],
            dates: [],
            numbers: []
        };
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        entities.emails = text.match(emailRegex) || [];
        const urlRegex = /https?:\/\/[^\s]+/g;
        entities.urls = text.match(urlRegex) || [];
        const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
        entities.dates = text.match(dateRegex) || [];
        const numberRegex = /\b\d+(?:\.\d+)?\b/g;
        entities.numbers = (text.match(numberRegex) || []).slice(0, 20);
        return entities;
    }
    async hasContentChanged(content) {
        if (!this.redis) {
            return true;
        }
        try {
            const cacheKey = `content_hash:${content.id}`;
            const storedHash = await this.redis.get(cacheKey);
            const currentHash = this.hashContent(content.text);
            if (storedHash === currentHash) {
                return false;
            }
            await this.redis.set(cacheKey, currentHash, 'EX', 86400);
            return true;
        }
        catch (error) {
            return true;
        }
    }
    hashContent(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    async storeIndexingMetadata(content) {
        if (!this.redis) {
            return;
        }
        try {
            const indexedContent = {
                contentId: content.id,
                sourceId: content.sourceId,
                vectorId: (0, uuid_1.v4)(),
                indexedAt: new Date(),
                status: 'indexed'
            };
            const cacheKey = `indexed_content:${content.id}`;
            await this.redis.setex(cacheKey, 86400, JSON.stringify(indexedContent));
        }
        catch (error) {
            console.warn(`Failed to store indexing metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async recordContentChange(change) {
        if (!this.redis) {
            return;
        }
        try {
            const cacheKey = `content_change:${change.contentId}:${change.timestamp.getTime()}`;
            await this.redis.setex(cacheKey, 86400, JSON.stringify(change));
        }
        catch (error) {
            console.warn(`Failed to record content change: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async removeFromIndex(contentId) {
        if (!this.redis) {
            return;
        }
        try {
            const keys = await this.redis.keys(`*${contentId}*`);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to remove content from index: ${error instanceof Error ? error.message : 'Unknown error'}`, 'INDEX_REMOVAL_ERROR');
        }
    }
    getConfig() {
        return { ...this.config };
    }
    getAvailableStrategies() {
        return Array.from(this.chunkingStrategies.keys());
    }
    async healthCheck() {
        try {
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
        }
        catch (error) {
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
exports.IndexingService = IndexingService;
//# sourceMappingURL=indexing.js.map