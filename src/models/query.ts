import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

export interface QueryFilter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
    value: any;
}

export interface Query {
    id: string;
    text: string;
    context?: object;
    filters?: QueryFilter[];
    timestamp: Date;
    userId?: string;
}

export interface ParsedQuery {
    originalText: string;
    processedText: string;
    intent: string;
    entities: string[];
    filters: QueryFilter[];
}

export interface QueryResult {
    id: string;
    response: string;
    sources: SourceReference[];
    confidence: number;
    processingTime: number;
    cached: boolean;
}

export interface SourceReference {
    sourceId: string;
    sourceName: string;
    contentId: string;
    title: string;
    excerpt: string;
    relevanceScore: number;
    url?: string;
}

// Validation schemas
const queryFilterSchema = Joi.object({
    field: Joi.string().required().min(1).max(100),
    operator: Joi.string().valid('eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains').required(),
    value: Joi.any().required()
});

const querySchema = Joi.object({
    id: Joi.string().uuid().required(),
    text: Joi.string().required().min(1).max(10000).trim(),
    context: Joi.object().optional(),
    filters: Joi.array().items(queryFilterSchema).optional(),
    timestamp: Joi.date().required(),
    userId: Joi.string().optional().min(1).max(100)
});

const queryResultSchema = Joi.object({
    id: Joi.string().uuid().required(),
    response: Joi.string().required().min(1),
    sources: Joi.array().items(Joi.object({
        sourceId: Joi.string().required(),
        sourceName: Joi.string().required(),
        contentId: Joi.string().required(),
        title: Joi.string().required(),
        excerpt: Joi.string().required(),
        relevanceScore: Joi.number().min(0).max(1).required(),
        url: Joi.string().uri().optional()
    })).required(),
    confidence: Joi.number().min(0).max(1).required(),
    processingTime: Joi.number().min(0).required(),
    cached: Joi.boolean().required()
});

// Query class with validation
export class QueryModel implements Query {
    public readonly id: string;
    public readonly text: string;
    public readonly context?: object;
    public readonly filters?: QueryFilter[];
    public readonly timestamp: Date;
    public readonly userId?: string;

    constructor(data: Partial<Query>) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);

        this.id = validatedData.id;
        this.text = validatedData.text;
        this.context = validatedData.context;
        this.filters = validatedData.filters;
        this.timestamp = validatedData.timestamp;
        this.userId = validatedData.userId;
    }

    private sanitize(data: Partial<Query>): Partial<Query> {
        return {
            id: data.id || uuidv4(),
            text: typeof data.text === 'string' ? data.text.trim() : data.text,
            context: data.context,
            filters: data.filters,
            timestamp: data.timestamp || new Date(),
            userId: typeof data.userId === 'string' ? data.userId.trim() : data.userId
        };
    }

    private validate(data: Partial<Query>): Query {
        const { error, value } = querySchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`Query validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as Query;
    }

    public toJSON(): Query {
        return {
            id: this.id,
            text: this.text,
            context: this.context,
            filters: this.filters,
            timestamp: this.timestamp,
            userId: this.userId
        };
    }

    public static fromJSON(data: any): QueryModel {
        return new QueryModel(data);
    }
}

// QueryResult class with validation
export class QueryResultModel implements QueryResult {
    public readonly id: string;
    public readonly response: string;
    public readonly sources: SourceReference[];
    public readonly confidence: number;
    public readonly processingTime: number;
    public readonly cached: boolean;

    constructor(data: Partial<QueryResult>) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);

        this.id = validatedData.id;
        this.response = validatedData.response;
        this.sources = validatedData.sources;
        this.confidence = validatedData.confidence;
        this.processingTime = validatedData.processingTime;
        this.cached = validatedData.cached;
    }

    private sanitize(data: Partial<QueryResult>): Partial<QueryResult> {
        return {
            id: data.id || uuidv4(),
            response: typeof data.response === 'string' ? data.response.trim() : data.response,
            sources: data.sources || [],
            confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : data.confidence,
            processingTime: typeof data.processingTime === 'number' ? Math.max(0, data.processingTime) : data.processingTime,
            cached: Boolean(data.cached)
        };
    }

    private validate(data: Partial<QueryResult>): QueryResult {
        const { error, value } = queryResultSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`QueryResult validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as QueryResult;
    }

    public toJSON(): QueryResult {
        return {
            id: this.id,
            response: this.response,
            sources: this.sources,
            confidence: this.confidence,
            processingTime: this.processingTime,
            cached: this.cached
        };
    }

    public static fromJSON(data: any): QueryResultModel {
        return new QueryResultModel(data);
    }
}