"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourceModel = exports.DataSourceConfigModel = void 0;
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const baseDataSourceConfigSchema = joi_1.default.object({
    connectionString: joi_1.default.string().optional().min(1).max(1000),
    apiEndpoint: joi_1.default.string().uri().optional(),
    filePath: joi_1.default.string().optional().min(1).max(500),
    credentials: joi_1.default.object({
        username: joi_1.default.string().optional().min(1).max(100),
        password: joi_1.default.string().optional().min(1).max(100),
        apiKey: joi_1.default.string().optional().min(1).max(200),
        token: joi_1.default.string().optional().min(1).max(500)
    }).optional(),
    syncInterval: joi_1.default.number().integer().min(60).max(86400).optional(),
    batchSize: joi_1.default.number().integer().min(1).max(10000).optional(),
    timeout: joi_1.default.number().integer().min(1000).max(300000).optional(),
    retryAttempts: joi_1.default.number().integer().min(0).max(10).optional()
});
const fileDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    filePath: joi_1.default.string().required().min(1).max(500),
    fileTypes: joi_1.default.array().items(joi_1.default.string().valid('pdf', 'txt', 'md', 'docx', 'doc', 'rtf')).optional(),
    watchForChanges: joi_1.default.boolean().optional().default(true),
    recursive: joi_1.default.boolean().optional().default(false),
    excludePatterns: joi_1.default.array().items(joi_1.default.string()).optional()
});
const databaseDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    connectionString: joi_1.default.string().required().min(1).max(1000),
    query: joi_1.default.string().optional().min(1).max(5000),
    table: joi_1.default.string().optional().min(1).max(100),
    incrementalField: joi_1.default.string().optional().min(1).max(100),
    credentials: joi_1.default.object({
        username: joi_1.default.string().required().min(1).max(100),
        password: joi_1.default.string().required().min(1).max(100)
    }).required()
});
const apiDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    apiEndpoint: joi_1.default.string().uri().required(),
    method: joi_1.default.string().valid('GET', 'POST').optional().default('GET'),
    headers: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.string()).optional(),
    queryParams: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.string()).optional(),
    credentials: joi_1.default.object({
        apiKey: joi_1.default.string().optional().min(1).max(200),
        token: joi_1.default.string().optional().min(1).max(500),
        username: joi_1.default.string().optional().min(1).max(100),
        password: joi_1.default.string().optional().min(1).max(100)
    }).optional(),
    pagination: joi_1.default.object({
        type: joi_1.default.string().valid('offset', 'cursor', 'page').required(),
        limitParam: joi_1.default.string().optional().default('limit'),
        offsetParam: joi_1.default.string().optional().default('offset'),
        cursorParam: joi_1.default.string().optional().default('cursor'),
        pageParam: joi_1.default.string().optional().default('page')
    }).optional()
});
const dataSourceConfigSchema = baseDataSourceConfigSchema;
const dataSourceSchema = joi_1.default.object({
    id: joi_1.default.string().uuid().required(),
    name: joi_1.default.string().required().min(1).max(100).trim(),
    type: joi_1.default.string().valid('file', 'database', 'api').required(),
    config: dataSourceConfigSchema.required(),
    status: joi_1.default.string().valid('active', 'inactive', 'error', 'syncing').required(),
    lastSync: joi_1.default.date().required(),
    documentCount: joi_1.default.number().integer().min(0).required(),
    errorMessage: joi_1.default.string().optional().max(1000),
    metadata: joi_1.default.object().optional()
});
class DataSourceConfigModel {
    constructor(config, type) {
        this.type = type;
        this.config = this.validateAndSanitize(config, type);
    }
    validateAndSanitize(config, type) {
        const sanitizedConfig = this.sanitizeConfig(config);
        return this.validateByType(sanitizedConfig, type);
    }
    sanitizeConfig(config) {
        const sanitized = {
            connectionString: typeof config.connectionString === 'string' ? config.connectionString.trim() : config.connectionString,
            apiEndpoint: typeof config.apiEndpoint === 'string' ? config.apiEndpoint.trim() : config.apiEndpoint,
            filePath: typeof config.filePath === 'string' ? config.filePath.trim() : config.filePath,
            credentials: config.credentials ? {
                username: typeof config.credentials.username === 'string' ? config.credentials.username.trim() : config.credentials.username,
                password: config.credentials.password,
                apiKey: typeof config.credentials.apiKey === 'string' ? config.credentials.apiKey.trim() : config.credentials.apiKey,
                token: typeof config.credentials.token === 'string' ? config.credentials.token.trim() : config.credentials.token
            } : config.credentials,
            syncInterval: typeof config.syncInterval === 'number' ? Math.max(60, config.syncInterval) : config.syncInterval,
            batchSize: typeof config.batchSize === 'number' ? Math.max(1, Math.min(10000, config.batchSize)) : config.batchSize,
            timeout: typeof config.timeout === 'number' ? Math.max(1000, Math.min(300000, config.timeout)) : config.timeout,
            retryAttempts: typeof config.retryAttempts === 'number' ? Math.max(0, Math.min(10, config.retryAttempts)) : config.retryAttempts
        };
        return { ...config, ...sanitized };
    }
    validateByType(config, type) {
        let schema;
        switch (type) {
            case 'file':
                schema = fileDataSourceConfigSchema;
                break;
            case 'database':
                schema = databaseDataSourceConfigSchema;
                break;
            case 'api':
                schema = apiDataSourceConfigSchema;
                break;
            default:
                schema = dataSourceConfigSchema;
        }
        const { error, value } = schema.validate(config, { abortEarly: false, stripUnknown: true });
        if (error) {
            throw new Error(`${type} DataSourceConfig validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        this.validateTypeSpecificConstraints(value, type);
        return value;
    }
    validateTypeSpecificConstraints(config, type) {
        switch (type) {
            case 'file':
                this.validateFileConfig(config);
                break;
            case 'database':
                this.validateDatabaseConfig(config);
                break;
            case 'api':
                this.validateApiConfig(config);
                break;
        }
    }
    validateFileConfig(config) {
        const path = require('path');
        if (!config.filePath || config.filePath.trim().length === 0) {
            throw new Error('File path cannot be empty');
        }
        if (config.fileTypes && config.fileTypes.length > 0) {
            const ext = path.extname(config.filePath).toLowerCase().substring(1);
            if (ext && !config.fileTypes.includes(ext)) {
                throw new Error(`File type '${ext}' is not in allowed types: ${config.fileTypes.join(', ')}`);
            }
        }
    }
    validateDatabaseConfig(config) {
        if (!config.connectionString.includes('://')) {
            throw new Error('Database connection string must include protocol (e.g., postgresql://, mongodb://)');
        }
        if (!config.query && !config.table) {
            throw new Error('Either query or table must be specified for database data source');
        }
        if (!config.credentials || !config.credentials.username || !config.credentials.password) {
            throw new Error('Database credentials (username and password) are required');
        }
    }
    validateApiConfig(config) {
        if (!config.credentials || (!config.credentials.apiKey && !config.credentials.token && !config.credentials.username)) {
            throw new Error('API credentials (apiKey, token, or username/password) are required');
        }
        if (config.pagination) {
            const { type } = config.pagination;
            if (type === 'offset' && (!config.pagination.offsetParam || config.pagination.offsetParam.trim() === '')) {
                throw new Error('offsetParam is required for offset pagination');
            }
            if (type === 'cursor' && (!config.pagination.cursorParam || config.pagination.cursorParam.trim() === '')) {
                throw new Error('cursorParam is required for cursor pagination');
            }
            if (type === 'page' && (!config.pagination.pageParam || config.pagination.pageParam.trim() === '')) {
                throw new Error('pageParam is required for page pagination');
            }
        }
    }
    static createFileConfig(config) {
        return new DataSourceConfigModel(config, 'file');
    }
    static createDatabaseConfig(config) {
        return new DataSourceConfigModel(config, 'database');
    }
    static createApiConfig(config) {
        return new DataSourceConfigModel(config, 'api');
    }
    toJSON() {
        return { ...this.config };
    }
    static fromJSON(data, type) {
        return new DataSourceConfigModel(data, type);
    }
}
exports.DataSourceConfigModel = DataSourceConfigModel;
class DataSourceModel {
    constructor(data) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);
        this.id = validatedData.id;
        this.name = validatedData.name;
        this.type = validatedData.type;
        this.config = validatedData.config;
        this.status = validatedData.status;
        this.lastSync = validatedData.lastSync;
        this.documentCount = validatedData.documentCount;
        this.errorMessage = validatedData.errorMessage;
        this.metadata = validatedData.metadata;
    }
    sanitize(data) {
        return {
            id: data.id || (0, uuid_1.v4)(),
            name: typeof data.name === 'string' ? data.name.trim() : data.name,
            type: data.type,
            config: this.sanitizeConfig(data.config, data.type),
            status: data.status || 'inactive',
            lastSync: data.lastSync || new Date(),
            documentCount: typeof data.documentCount === 'number' ? Math.max(0, Math.floor(data.documentCount)) : 0,
            errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage.trim() : data.errorMessage,
            metadata: data.metadata
        };
    }
    sanitizeConfig(config, type) {
        if (!config)
            return {};
        if (type) {
            const configModel = new DataSourceConfigModel(config, type);
            return configModel.config;
        }
        return {
            connectionString: typeof config.connectionString === 'string' ? config.connectionString.trim() : config.connectionString,
            apiEndpoint: typeof config.apiEndpoint === 'string' ? config.apiEndpoint.trim() : config.apiEndpoint,
            filePath: typeof config.filePath === 'string' ? config.filePath.trim() : config.filePath,
            credentials: config.credentials ? {
                username: typeof config.credentials.username === 'string' ? config.credentials.username.trim() : config.credentials.username,
                password: config.credentials.password,
                apiKey: typeof config.credentials.apiKey === 'string' ? config.credentials.apiKey.trim() : config.credentials.apiKey,
                token: typeof config.credentials.token === 'string' ? config.credentials.token.trim() : config.credentials.token
            } : config.credentials,
            syncInterval: typeof config.syncInterval === 'number' ? Math.max(60, config.syncInterval) : config.syncInterval,
            batchSize: typeof config.batchSize === 'number' ? Math.max(1, Math.min(10000, config.batchSize)) : config.batchSize,
            timeout: typeof config.timeout === 'number' ? Math.max(1000, Math.min(300000, config.timeout)) : config.timeout,
            retryAttempts: typeof config.retryAttempts === 'number' ? Math.max(0, Math.min(10, config.retryAttempts)) : config.retryAttempts
        };
    }
    validate(data) {
        const { error, value } = dataSourceSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`DataSource validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            config: this.config,
            status: this.status,
            lastSync: this.lastSync,
            documentCount: this.documentCount,
            errorMessage: this.errorMessage,
            metadata: this.metadata
        };
    }
    static fromJSON(data) {
        return new DataSourceModel(data);
    }
    updateStatus(status, errorMessage) {
        return new DataSourceModel({
            ...this.toJSON(),
            status,
            errorMessage: status === 'error' ? errorMessage : undefined,
            lastSync: status === 'active' ? new Date() : this.lastSync
        });
    }
    updateDocumentCount(count) {
        return new DataSourceModel({
            ...this.toJSON(),
            documentCount: count,
            lastSync: new Date()
        });
    }
}
exports.DataSourceModel = DataSourceModel;
//# sourceMappingURL=dataSource.js.map