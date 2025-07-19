import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

export interface ContentChunk {
    id: string;
    text: string;
    embedding: number[];
    position: number;
    metadata: {
        startIndex: number;
        endIndex: number;
        chunkSize: number;
        overlap?: number;
        [key: string]: any;
    };
}

export interface Content {
    id: string;
    sourceId: string;
    title: string;
    text: string;
    metadata: {
        fileType?: string;
        author?: string;
        createdAt?: Date;
        modifiedAt?: Date;
        tags?: string[];
        category?: string;
        [key: string]: any;
    };
    embedding: number[];
    chunks: ContentChunk[];
    lastUpdated: Date;
    version: number;
}

export interface ContentChange {
    contentId: string;
    changeType: 'created' | 'updated' | 'deleted';
    timestamp: Date;
    previousVersion?: number;
    newVersion?: number;
}

export interface IndexedContent {
    contentId: string;
    sourceId: string;
    vectorId: string;
    indexedAt: Date;
    status: 'indexed' | 'pending' | 'failed';
}

// Validation schemas
const contentChunkSchema = Joi.object({
    id: Joi.string().uuid().required(),
    text: Joi.string().required().min(1).max(50000),
    embedding: Joi.array().items(Joi.number()).min(1).max(10000).required(),
    position: Joi.number().integer().min(0).required(),
    metadata: Joi.object({
        startIndex: Joi.number().integer().min(0).required(),
        endIndex: Joi.number().integer().min(0).required(),
        chunkSize: Joi.number().integer().min(1).required(),
        overlap: Joi.number().integer().min(0).optional()
    }).unknown(true).required()
});

const contentSchema = Joi.object({
    id: Joi.string().uuid().required(),
    sourceId: Joi.string().required().min(1).max(100),
    title: Joi.string().required().min(1).max(500).trim(),
    text: Joi.string().required().min(1).max(1000000),
    metadata: Joi.object({
        fileType: Joi.string().optional().max(50),
        author: Joi.string().optional().max(200),
        createdAt: Joi.date().optional(),
        modifiedAt: Joi.date().optional(),
        tags: Joi.array().items(Joi.string().max(100)).optional(),
        category: Joi.string().optional().max(100)
    }).unknown(true).required(),
    embedding: Joi.array().items(Joi.number()).min(1).max(10000).required(),
    chunks: Joi.array().items(contentChunkSchema).required(),
    lastUpdated: Joi.date().required(),
    version: Joi.number().integer().min(1).required()
});

// ContentChunk class with validation
export class ContentChunkModel implements ContentChunk {
    public readonly id: string;
    public readonly text: string;
    public readonly embedding: number[];
    public readonly position: number;
    public readonly metadata: {
        startIndex: number;
        endIndex: number;
        chunkSize: number;
        overlap?: number;
        [key: string]: any;
    };

    constructor(data: Partial<ContentChunk>) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);

        this.id = validatedData.id;
        this.text = validatedData.text;
        this.embedding = validatedData.embedding;
        this.position = validatedData.position;
        this.metadata = validatedData.metadata;
    }

    private sanitize(data: Partial<ContentChunk>): Partial<ContentChunk> {
        return {
            id: data.id || uuidv4(),
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

    private validate(data: Partial<ContentChunk>): ContentChunk {
        const { error, value } = contentChunkSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`ContentChunk validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as ContentChunk;
    }

    public toJSON(): ContentChunk {
        return {
            id: this.id,
            text: this.text,
            embedding: this.embedding,
            position: this.position,
            metadata: this.metadata
        };
    }

    public static fromJSON(data: any): ContentChunkModel {
        return new ContentChunkModel(data);
    }
}

// Content class with validation
export class ContentModel implements Content {
    public readonly id: string;
    public readonly sourceId: string;
    public readonly title: string;
    public readonly text: string;
    public readonly metadata: {
        fileType?: string;
        author?: string;
        createdAt?: Date;
        modifiedAt?: Date;
        tags?: string[];
        category?: string;
        [key: string]: any;
    };
    public readonly embedding: number[];
    public readonly chunks: ContentChunk[];
    public readonly lastUpdated: Date;
    public readonly version: number;

    constructor(data: Partial<Content>) {
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

    private sanitize(data: Partial<Content>): Partial<Content> {
        return {
            id: data.id || uuidv4(),
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

    private validate(data: Partial<Content>): Content {
        const { error, value } = contentSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`Content validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as Content;
    }

    public toJSON(): Content {
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

    public static fromJSON(data: any): ContentModel {
        return new ContentModel(data);
    }

    public updateVersion(): ContentModel {
        return new ContentModel({
            ...this.toJSON(),
            version: this.version + 1,
            lastUpdated: new Date()
        });
    }

    public addChunk(chunk: ContentChunk): ContentModel {
        return new ContentModel({
            ...this.toJSON(),
            chunks: [...this.chunks, chunk],
            lastUpdated: new Date()
        });
    }
}