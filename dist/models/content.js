"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentModel = exports.ContentChunkModel = void 0;
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const contentChunkSchema = joi_1.default.object({
    id: joi_1.default.string().uuid().required(),
    text: joi_1.default.string().required().min(1).max(50000),
    embedding: joi_1.default.array().items(joi_1.default.number()).min(1).max(10000).required(),
    position: joi_1.default.number().integer().min(0).required(),
    metadata: joi_1.default.object({
        startIndex: joi_1.default.number().integer().min(0).required(),
        endIndex: joi_1.default.number().integer().min(0).required(),
        chunkSize: joi_1.default.number().integer().min(1).required(),
        overlap: joi_1.default.number().integer().min(0).optional()
    }).unknown(true).required()
});
const contentSchema = joi_1.default.object({
    id: joi_1.default.string().uuid().required(),
    sourceId: joi_1.default.string().required().min(1).max(100),
    title: joi_1.default.string().required().min(1).max(500).trim(),
    text: joi_1.default.string().required().min(1).max(1000000),
    metadata: joi_1.default.object({
        fileType: joi_1.default.string().optional().max(50),
        author: joi_1.default.string().optional().max(200),
        createdAt: joi_1.default.date().optional(),
        modifiedAt: joi_1.default.date().optional(),
        tags: joi_1.default.array().items(joi_1.default.string().max(100)).optional(),
        category: joi_1.default.string().optional().max(100)
    }).unknown(true).required(),
    embedding: joi_1.default.array().items(joi_1.default.number()).min(1).max(10000).required(),
    chunks: joi_1.default.array().items(contentChunkSchema).required(),
    lastUpdated: joi_1.default.date().required(),
    version: joi_1.default.number().integer().min(1).required()
});
class ContentChunkModel {
    constructor(data) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);
        this.id = validatedData.id;
        this.text = validatedData.text;
        this.embedding = validatedData.embedding;
        this.position = validatedData.position;
        this.metadata = validatedData.metadata;
    }
    sanitize(data) {
        return {
            id: data.id || (0, uuid_1.v4)(),
            text: typeof data.text === 'string' ? data.text.trim() : data.text,
            embedding: Array.isArray(data.embedding) ? data.embedding.map(n => Number(n)) : data.embedding,
            position: typeof data.position === 'number' ? Math.max(0, Math.floor(data.position)) : data.position,
            metadata: data.metadata ? {
                ...data.metadata,
                startIndex: typeof data.metadata.startIndex === 'number' ? Math.max(0, Math.floor(data.metadata.startIndex)) : data.metadata.startIndex,
                endIndex: typeof data.metadata.endIndex === 'number' ? Math.max(0, Math.floor(data.metadata.endIndex)) : data.metadata.endIndex,
                chunkSize: typeof data.metadata.chunkSize === 'number' ? Math.max(1, Math.floor(data.metadata.chunkSize)) : data.metadata.chunkSize,
                overlap: typeof data.metadata.overlap === 'number' ? Math.max(0, Math.floor(data.metadata.overlap)) : data.metadata.overlap
            } : data.metadata
        };
    }
    validate(data) {
        const { error, value } = contentChunkSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`ContentChunk validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    toJSON() {
        return {
            id: this.id,
            text: this.text,
            embedding: this.embedding,
            position: this.position,
            metadata: this.metadata
        };
    }
    static fromJSON(data) {
        return new ContentChunkModel(data);
    }
}
exports.ContentChunkModel = ContentChunkModel;
class ContentModel {
    constructor(data) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);
        this.id = validatedData.id;
        this.sourceId = validatedData.sourceId;
        this.title = validatedData.title;
        this.text = validatedData.text;
        this.metadata = validatedData.metadata;
        this.embedding = validatedData.embedding;
        this.chunks = validatedData.chunks;
        this.lastUpdated = validatedData.lastUpdated;
        this.version = validatedData.version;
    }
    sanitize(data) {
        return {
            id: data.id || (0, uuid_1.v4)(),
            sourceId: typeof data.sourceId === 'string' ? data.sourceId.trim() : data.sourceId,
            title: typeof data.title === 'string' ? data.title.trim() : data.title,
            text: typeof data.text === 'string' ? data.text.trim() : data.text,
            metadata: data.metadata ? {
                ...data.metadata,
                fileType: typeof data.metadata.fileType === 'string' ? data.metadata.fileType.trim() : data.metadata.fileType,
                author: typeof data.metadata.author === 'string' ? data.metadata.author.trim() : data.metadata.author,
                tags: Array.isArray(data.metadata.tags) ? data.metadata.tags.map(tag => typeof tag === 'string' ? tag.trim() : tag) : data.metadata.tags,
                category: typeof data.metadata.category === 'string' ? data.metadata.category.trim() : data.metadata.category
            } : data.metadata || {},
            embedding: Array.isArray(data.embedding) ? data.embedding.map(n => Number(n)) : data.embedding,
            chunks: Array.isArray(data.chunks) ? data.chunks.map(chunk => chunk instanceof ContentChunkModel ? chunk.toJSON() : chunk) : data.chunks || [],
            lastUpdated: data.lastUpdated || new Date(),
            version: typeof data.version === 'number' ? Math.max(1, Math.floor(data.version)) : 1
        };
    }
    validate(data) {
        const { error, value } = contentSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`Content validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    toJSON() {
        return {
            id: this.id,
            sourceId: this.sourceId,
            title: this.title,
            text: this.text,
            metadata: this.metadata,
            embedding: this.embedding,
            chunks: this.chunks,
            lastUpdated: this.lastUpdated,
            version: this.version
        };
    }
    static fromJSON(data) {
        return new ContentModel(data);
    }
    updateVersion() {
        return new ContentModel({
            ...this.toJSON(),
            version: this.version + 1,
            lastUpdated: new Date()
        });
    }
    addChunk(chunk) {
        return new ContentModel({
            ...this.toJSON(),
            chunks: [...this.chunks, chunk],
            lastUpdated: new Date()
        });
    }
}
exports.ContentModel = ContentModel;
//# sourceMappingURL=content.js.map