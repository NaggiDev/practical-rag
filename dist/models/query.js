"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryResultModel = exports.QueryModel = void 0;
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const queryFilterSchema = joi_1.default.object({
    field: joi_1.default.string().required().min(1).max(100),
    operator: joi_1.default.string().valid('eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains').required(),
    value: joi_1.default.any().required()
});
const querySchema = joi_1.default.object({
    id: joi_1.default.string().uuid().required(),
    text: joi_1.default.string().required().min(1).max(10000).trim(),
    context: joi_1.default.object().optional(),
    filters: joi_1.default.array().items(queryFilterSchema).optional(),
    timestamp: joi_1.default.date().required(),
    userId: joi_1.default.string().optional().min(1).max(100)
});
const queryResultSchema = joi_1.default.object({
    id: joi_1.default.string().uuid().required(),
    response: joi_1.default.string().required().min(1),
    sources: joi_1.default.array().items(joi_1.default.object({
        sourceId: joi_1.default.string().required(),
        sourceName: joi_1.default.string().required(),
        contentId: joi_1.default.string().required(),
        title: joi_1.default.string().required(),
        excerpt: joi_1.default.string().required(),
        relevanceScore: joi_1.default.number().min(0).max(1).required(),
        url: joi_1.default.string().uri().optional()
    })).required(),
    confidence: joi_1.default.number().min(0).max(1).required(),
    processingTime: joi_1.default.number().min(0).required(),
    cached: joi_1.default.boolean().required()
});
class QueryModel {
    constructor(data) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);
        this.id = validatedData.id;
        this.text = validatedData.text;
        this.context = validatedData.context;
        this.filters = validatedData.filters;
        this.timestamp = validatedData.timestamp;
        this.userId = validatedData.userId;
    }
    sanitize(data) {
        return {
            id: data.id || (0, uuid_1.v4)(),
            text: typeof data.text === 'string' ? data.text.trim() : data.text,
            context: data.context,
            filters: data.filters,
            timestamp: data.timestamp || new Date(),
            userId: typeof data.userId === 'string' ? data.userId.trim() : data.userId
        };
    }
    validate(data) {
        const { error, value } = querySchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`Query validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    toJSON() {
        return {
            id: this.id,
            text: this.text,
            context: this.context,
            filters: this.filters,
            timestamp: this.timestamp,
            userId: this.userId
        };
    }
    static fromJSON(data) {
        return new QueryModel(data);
    }
}
exports.QueryModel = QueryModel;
class QueryResultModel {
    constructor(data) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);
        this.id = validatedData.id;
        this.response = validatedData.response;
        this.sources = validatedData.sources;
        this.confidence = validatedData.confidence;
        this.processingTime = validatedData.processingTime;
        this.cached = validatedData.cached;
    }
    sanitize(data) {
        return {
            id: data.id || (0, uuid_1.v4)(),
            response: typeof data.response === 'string' ? data.response.trim() : data.response,
            sources: data.sources || [],
            confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : data.confidence,
            processingTime: typeof data.processingTime === 'number' ? Math.max(0, data.processingTime) : data.processingTime,
            cached: Boolean(data.cached)
        };
    }
    validate(data) {
        const { error, value } = queryResultSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`QueryResult validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    toJSON() {
        return {
            id: this.id,
            response: this.response,
            sources: this.sources,
            confidence: this.confidence,
            processingTime: this.processingTime,
            cached: this.cached
        };
    }
    static fromJSON(data) {
        return new QueryResultModel(data);
    }
}
exports.QueryResultModel = QueryResultModel;
//# sourceMappingURL=query.js.map