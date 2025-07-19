import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

export type DataSourceType = 'file' | 'database' | 'api';
export type DataSourceStatus = 'active' | 'inactive' | 'error' | 'syncing';

export interface DataSourceConfig {
    connectionString?: string;
    apiEndpoint?: string;
    filePath?: string;
    credentials?: {
        username?: string;
        password?: string;
        apiKey?: string;
        token?: string;
    };
    syncInterval?: number;
    batchSize?: number;
    timeout?: number;
    retryAttempts?: number;
}

// Type-specific configuration interfaces
export interface FileDataSourceConfig extends DataSourceConfig {
    filePath: string;
    fileTypes?: string[];
    watchForChanges?: boolean;
    recursive?: boolean;
    excludePatterns?: string[];
}

export interface DatabaseDataSourceConfig extends DataSourceConfig {
    connectionString: string;
    query?: string;
    table?: string;
    incrementalField?: string;
    credentials: {
        username: string;
        password: string;
    };
}

export interface ApiDataSourceConfig extends DataSourceConfig {
    apiEndpoint: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    credentials?: {
        apiKey?: string;
        token?: string;
        username?: string;
        password?: string;
    };
    pagination?: {
        type: 'offset' | 'cursor' | 'page';
        limitParam?: string;
        offsetParam?: string;
        cursorParam?: string;
        pageParam?: string;
    };
}

export interface DataSource {
    id: string;
    name: string;
    type: DataSourceType;
    config: DataSourceConfig;
    status: DataSourceStatus;
    lastSync: Date;
    documentCount: number;
    errorMessage?: string;
    metadata?: object;
}

export interface DataSourceHealth {
    sourceId: string;
    isHealthy: boolean;
    lastCheck: Date;
    responseTime?: number;
    errorCount: number;
    lastError?: string;
}

// Base validation schema
const baseDataSourceConfigSchema = Joi.object({
    connectionString: Joi.string().optional().min(1).max(1000),
    apiEndpoint: Joi.string().uri().optional(),
    filePath: Joi.string().optional().min(1).max(500),
    credentials: Joi.object({
        username: Joi.string().optional().min(1).max(100),
        password: Joi.string().optional().min(1).max(100),
        apiKey: Joi.string().optional().min(1).max(200),
        token: Joi.string().optional().min(1).max(500)
    }).optional(),
    syncInterval: Joi.number().integer().min(60).max(86400).optional(), // 1 minute to 24 hours
    batchSize: Joi.number().integer().min(1).max(10000).optional(),
    timeout: Joi.number().integer().min(1000).max(300000).optional(), // 1 second to 5 minutes
    retryAttempts: Joi.number().integer().min(0).max(10).optional()
});

// Type-specific validation schemas
const fileDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    filePath: Joi.string().required().min(1).max(500),
    fileTypes: Joi.array().items(Joi.string().valid('pdf', 'txt', 'md', 'docx', 'doc', 'rtf')).optional(),
    watchForChanges: Joi.boolean().optional().default(true),
    recursive: Joi.boolean().optional().default(false),
    excludePatterns: Joi.array().items(Joi.string()).optional()
});

const databaseDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    connectionString: Joi.string().required().min(1).max(1000),
    query: Joi.string().optional().min(1).max(5000),
    table: Joi.string().optional().min(1).max(100),
    incrementalField: Joi.string().optional().min(1).max(100),
    credentials: Joi.object({
        username: Joi.string().required().min(1).max(100),
        password: Joi.string().required().min(1).max(100)
    }).required()
});

const apiDataSourceConfigSchema = baseDataSourceConfigSchema.keys({
    apiEndpoint: Joi.string().uri().required(),
    method: Joi.string().valid('GET', 'POST').optional().default('GET'),
    headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    queryParams: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    credentials: Joi.object({
        apiKey: Joi.string().optional().min(1).max(200),
        token: Joi.string().optional().min(1).max(500),
        username: Joi.string().optional().min(1).max(100),
        password: Joi.string().optional().min(1).max(100)
    }).optional(),
    pagination: Joi.object({
        type: Joi.string().valid('offset', 'cursor', 'page').required(),
        limitParam: Joi.string().optional().default('limit'),
        offsetParam: Joi.string().optional().default('offset'),
        cursorParam: Joi.string().optional().default('cursor'),
        pageParam: Joi.string().optional().default('page')
    }).optional()
});

// Generic config schema (for backward compatibility)
const dataSourceConfigSchema = baseDataSourceConfigSchema;

const dataSourceSchema = Joi.object({
    id: Joi.string().uuid().required(),
    name: Joi.string().required().min(1).max(100).trim(),
    type: Joi.string().valid('file', 'database', 'api').required(),
    config: dataSourceConfigSchema.required(),
    status: Joi.string().valid('active', 'inactive', 'error', 'syncing').required(),
    lastSync: Joi.date().required(),
    documentCount: Joi.number().integer().min(0).required(),
    errorMessage: Joi.string().optional().max(1000),
    metadata: Joi.object().optional()
});

// DataSourceConfig class with type-specific validation
export class DataSourceConfigModel {
    public readonly config: DataSourceConfig;
    public readonly type: DataSourceType;

    constructor(config: DataSourceConfig, type: DataSourceType) {
        this.type = type;
        this.config = this.validateAndSanitize(config, type);
    }

    private validateAndSanitize(config: DataSourceConfig, type: DataSourceType): DataSourceConfig {
        const sanitizedConfig = this.sanitizeConfig(config);
        return this.validateByType(sanitizedConfig, type);
    }

    private sanitizeConfig(config: DataSourceConfig): DataSourceConfig {
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

        // Merge with any additional properties from the original config
        return { ...config, ...sanitized };
    }

    private validateByType(config: DataSourceConfig, type: DataSourceType): DataSourceConfig {
        let schema: Joi.ObjectSchema;

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

        // Additional type-specific validation
        this.validateTypeSpecificConstraints(value, type);

        return value as DataSourceConfig;
    }

    private validateTypeSpecificConstraints(config: DataSourceConfig, type: DataSourceType): void {
        switch (type) {
            case 'file':
                this.validateFileConfig(config as FileDataSourceConfig);
                break;
            case 'database':
                this.validateDatabaseConfig(config as DatabaseDataSourceConfig);
                break;
            case 'api':
                this.validateApiConfig(config as ApiDataSourceConfig);
                break;
        }
    }

    private validateFileConfig(config: FileDataSourceConfig): void {
        const path = require('path');

        // Basic path validation - check if it's a valid path format
        if (!config.filePath || config.filePath.trim().length === 0) {
            throw new Error('File path cannot be empty');
        }

        // Validate file types if specified
        if (config.fileTypes && config.fileTypes.length > 0) {
            // If the path has an extension, validate it against allowed types
            const ext = path.extname(config.filePath).toLowerCase().substring(1);
            if (ext && !config.fileTypes.includes(ext)) {
                throw new Error(`File type '${ext}' is not in allowed types: ${config.fileTypes.join(', ')}`);
            }
        }
    }

    private validateDatabaseConfig(config: DatabaseDataSourceConfig): void {
        // Validate connection string format
        if (!config.connectionString.includes('://')) {
            throw new Error('Database connection string must include protocol (e.g., postgresql://, mongodb://)');
        }

        // Ensure either query or table is specified
        if (!config.query && !config.table) {
            throw new Error('Either query or table must be specified for database data source');
        }

        // Validate credentials are provided
        if (!config.credentials || !config.credentials.username || !config.credentials.password) {
            throw new Error('Database credentials (username and password) are required');
        }
    }

    private validateApiConfig(config: ApiDataSourceConfig): void {
        // URL validation is already handled by Joi schema, so we don't need to re-validate here

        // Validate authentication is provided
        if (!config.credentials || (!config.credentials.apiKey && !config.credentials.token && !config.credentials.username)) {
            throw new Error('API credentials (apiKey, token, or username/password) are required');
        }

        // Validate pagination configuration if provided
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

    public static createFileConfig(config: Partial<FileDataSourceConfig>): DataSourceConfigModel {
        return new DataSourceConfigModel(config as FileDataSourceConfig, 'file');
    }

    public static createDatabaseConfig(config: Partial<DatabaseDataSourceConfig>): DataSourceConfigModel {
        return new DataSourceConfigModel(config as DatabaseDataSourceConfig, 'database');
    }

    public static createApiConfig(config: Partial<ApiDataSourceConfig>): DataSourceConfigModel {
        return new DataSourceConfigModel(config as ApiDataSourceConfig, 'api');
    }

    public toJSON(): DataSourceConfig {
        return { ...this.config };
    }

    public static fromJSON(data: any, type: DataSourceType): DataSourceConfigModel {
        return new DataSourceConfigModel(data, type);
    }
}

// DataSource class with validation
export class DataSourceModel implements DataSource {
    public readonly id: string;
    public readonly name: string;
    public readonly type: DataSourceType;
    public readonly config: DataSourceConfig;
    public readonly status: DataSourceStatus;
    public readonly lastSync: Date;
    public readonly documentCount: number;
    public readonly errorMessage?: string;
    public readonly metadata?: object;

    constructor(data: Partial<DataSource>) {
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

    private sanitize(data: Partial<DataSource>): Partial<DataSource> {
        return {
            id: data.id || uuidv4(),
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

    private sanitizeConfig(config?: DataSourceConfig, type?: DataSourceType): DataSourceConfig {
        if (!config) return {};

        // Use DataSourceConfigModel for type-specific validation if type is provided
        if (type) {
            const configModel = new DataSourceConfigModel(config, type);
            return configModel.config;
        }

        // Fallback to basic sanitization
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

    private validate(data: Partial<DataSource>): DataSource {
        const { error, value } = dataSourceSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`DataSource validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as DataSource;
    }

    public toJSON(): DataSource {
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

    public static fromJSON(data: any): DataSourceModel {
        return new DataSourceModel(data);
    }

    public updateStatus(status: DataSourceStatus, errorMessage?: string): DataSourceModel {
        return new DataSourceModel({
            ...this.toJSON(),
            status,
            errorMessage: status === 'error' ? errorMessage : undefined,
            lastSync: status === 'active' ? new Date() : this.lastSync
        });
    }

    public updateDocumentCount(count: number): DataSourceModel {
        return new DataSourceModel({
            ...this.toJSON(),
            documentCount: count,
            lastSync: new Date()
        });
    }
}