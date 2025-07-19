import * as dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

export interface EnvironmentValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedEnv: Record<string, any>;
}

// Environment variable schema
const envSchema = Joi.object({
    // Server configuration
    PORT: Joi.number().port().default(3000),
    HOST: Joi.string().hostname().default('0.0.0.0'),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

    // CORS configuration
    CORS_ENABLED: Joi.boolean().default(true),
    CORS_ORIGINS: Joi.string().default('*'),

    // Rate limiting
    RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).max(3600000).default(60000),
    RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).max(10000).default(100),

    // Server timeout
    SERVER_TIMEOUT: Joi.number().integer().min(1000).max(300000).default(30000),

    // Vector database configuration
    VECTOR_DB_PROVIDER: Joi.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').default('faiss'),
    VECTOR_DB_CONNECTION_STRING: Joi.string().optional(),
    VECTOR_DB_API_KEY: Joi.string().optional(),
    VECTOR_DB_INDEX_NAME: Joi.string().default('rag-index'),
    VECTOR_DB_DIMENSION: Joi.number().integer().min(1).max(10000).default(384),

    // Metadata database configuration
    METADATA_DB_PROVIDER: Joi.string().valid('postgresql', 'mongodb', 'sqlite').default('sqlite'),
    METADATA_DB_CONNECTION_STRING: Joi.string().default('sqlite://./data/metadata.db'),

    // Redis cache configuration
    REDIS_HOST: Joi.string().hostname().default('localhost'),
    REDIS_PORT: Joi.number().port().default(6379),
    REDIS_PASSWORD: Joi.string().optional(),
    REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
    REDIS_MAX_MEMORY: Joi.string().pattern(/^\d+[kmg]b$/i).default('256mb'),
    REDIS_EVICTION_POLICY: Joi.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').default('allkeys-lru'),

    // Cache TTL configuration
    CACHE_TTL_QUERY_RESULTS: Joi.number().integer().min(60).max(86400).default(3600),
    CACHE_TTL_EMBEDDINGS: Joi.number().integer().min(300).max(604800).default(86400),
    CACHE_TTL_HEALTH_CHECKS: Joi.number().integer().min(30).max(3600).default(300),

    // Embedding configuration
    EMBEDDING_PROVIDER: Joi.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').default('sentence-transformers'),
    EMBEDDING_MODEL: Joi.string().default('all-MiniLM-L6-v2'),
    EMBEDDING_API_KEY: Joi.string().optional(),
    EMBEDDING_DIMENSION: Joi.number().integer().min(1).max(10000).default(384),
    EMBEDDING_BATCH_SIZE: Joi.number().integer().min(1).max(1000).default(32),
    EMBEDDING_TIMEOUT: Joi.number().integer().min(1000).max(300000).default(30000),

    // Search configuration
    SEARCH_DEFAULT_TOP_K: Joi.number().integer().min(1).max(1000).default(10),
    SEARCH_MAX_TOP_K: Joi.number().integer().min(1).max(1000).default(100),
    SEARCH_SIMILARITY_THRESHOLD: Joi.number().min(0).max(1).default(0.7),

    // Hybrid search configuration
    HYBRID_SEARCH_ENABLED: Joi.boolean().default(true),
    HYBRID_SEARCH_VECTOR_WEIGHT: Joi.number().min(0).max(1).default(0.7),
    HYBRID_SEARCH_KEYWORD_WEIGHT: Joi.number().min(0).max(1).default(0.3),

    // Reranking configuration
    RERANKING_ENABLED: Joi.boolean().default(false),
    RERANKING_MODEL: Joi.string().optional(),

    // Monitoring configuration
    METRICS_ENABLED: Joi.boolean().default(true),
    METRICS_PORT: Joi.number().port().default(9090),
    METRICS_PATH: Joi.string().default('/metrics'),

    // Logging configuration
    LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
    LOG_FORMAT: Joi.string().valid('json', 'text').default('json'),
    LOG_FILE: Joi.string().optional(),

    // Health check configuration
    HEALTH_CHECK_INTERVAL: Joi.number().integer().min(1000).max(300000).default(30000),
    HEALTH_CHECK_TIMEOUT: Joi.number().integer().min(1000).max(60000).default(5000)
}).unknown(true); // Allow unknown environment variables

export class EnvironmentValidator {
    private static instance: EnvironmentValidator;
    private validatedEnv: Record<string, any> | null = null;

    private constructor() { }

    public static getInstance(): EnvironmentValidator {
        if (!EnvironmentValidator.instance) {
            EnvironmentValidator.instance = new EnvironmentValidator();
        }
        return EnvironmentValidator.instance;
    }

    public validateEnvironment(): EnvironmentValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Validate environment variables against schema
            const { error, value, warning } = envSchema.validate(process.env, {
                abortEarly: false,
                stripUnknown: false,
                convert: true
            });

            if (error) {
                errors.push(...error.details.map(detail => detail.message));
            }

            if (warning) {
                warnings.push(...warning.details.map(detail => detail.message));
            }

            // Additional custom validations
            this.performCustomValidations(value, errors, warnings);

            this.validatedEnv = value;

            return {
                valid: errors.length === 0,
                errors,
                warnings,
                sanitizedEnv: value
            };
        } catch (err) {
            errors.push(`Environment validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return {
                valid: false,
                errors,
                warnings,
                sanitizedEnv: {}
            };
        }
    }

    private performCustomValidations(env: Record<string, any>, errors: string[], warnings: string[]): void {
        // Validate hybrid search weights sum to 1
        const vectorWeight = parseFloat(env.HYBRID_SEARCH_VECTOR_WEIGHT || '0.7');
        const keywordWeight = parseFloat(env.HYBRID_SEARCH_KEYWORD_WEIGHT || '0.3');
        if (Math.abs(vectorWeight + keywordWeight - 1) > 0.001) {
            errors.push('HYBRID_SEARCH_VECTOR_WEIGHT and HYBRID_SEARCH_KEYWORD_WEIGHT must sum to 1.0');
        }

        // Validate embedding dimension matches vector database dimension
        const embeddingDim = parseInt(env.EMBEDDING_DIMENSION || '384');
        const vectorDbDim = parseInt(env.VECTOR_DB_DIMENSION || '384');
        if (embeddingDim !== vectorDbDim) {
            errors.push('EMBEDDING_DIMENSION must match VECTOR_DB_DIMENSION');
        }

        // Validate required API keys for certain providers
        if (env.EMBEDDING_PROVIDER === 'openai' && !env.EMBEDDING_API_KEY) {
            errors.push('EMBEDDING_API_KEY is required when using OpenAI embedding provider');
        }

        if (env.VECTOR_DB_PROVIDER === 'pinecone' && !env.VECTOR_DB_API_KEY) {
            errors.push('VECTOR_DB_API_KEY is required when using Pinecone vector database');
        }

        // Validate connection strings for database providers
        if (env.METADATA_DB_PROVIDER !== 'sqlite' && !env.METADATA_DB_CONNECTION_STRING) {
            errors.push('METADATA_DB_CONNECTION_STRING is required for non-SQLite database providers');
        }

        // Performance warnings
        if (env.EMBEDDING_BATCH_SIZE > 100) {
            warnings.push('EMBEDDING_BATCH_SIZE > 100 may cause memory issues');
        }

        if (env.SEARCH_MAX_TOP_K > 500) {
            warnings.push('SEARCH_MAX_TOP_K > 500 may impact performance');
        }

        // Security warnings
        if (env.NODE_ENV === 'production') {
            if (env.CORS_ORIGINS === '*') {
                warnings.push('CORS_ORIGINS should not be "*" in production');
            }

            if (!env.REDIS_PASSWORD) {
                warnings.push('REDIS_PASSWORD should be set in production');
            }
        }
    }

    public getValidatedEnvironment(): Record<string, any> {
        if (!this.validatedEnv) {
            const result = this.validateEnvironment();
            if (!result.valid) {
                throw new Error(`Environment validation failed: ${result.errors.join(', ')}`);
            }
        }
        return this.validatedEnv!;
    }

    public getEnvironmentVariable(key: string, defaultValue?: any): any {
        const env = this.getValidatedEnvironment();
        return env[key] !== undefined ? env[key] : defaultValue;
    }

    public isProduction(): boolean {
        return this.getEnvironmentVariable('NODE_ENV') === 'production';
    }

    public isDevelopment(): boolean {
        return this.getEnvironmentVariable('NODE_ENV') === 'development';
    }

    public isTest(): boolean {
        return this.getEnvironmentVariable('NODE_ENV') === 'test';
    }

    public generateEnvTemplate(): string {
        const template = `# Fast RAG System Configuration

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
CORS_ENABLED=true
CORS_ORIGINS=*

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Server Timeout
SERVER_TIMEOUT=30000

# Vector Database Configuration
VECTOR_DB_PROVIDER=faiss
VECTOR_DB_CONNECTION_STRING=
VECTOR_DB_API_KEY=
VECTOR_DB_INDEX_NAME=rag-index
VECTOR_DB_DIMENSION=384

# Metadata Database Configuration
METADATA_DB_PROVIDER=sqlite
METADATA_DB_CONNECTION_STRING=sqlite://./data/metadata.db

# Redis Cache Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_MAX_MEMORY=256mb
REDIS_EVICTION_POLICY=allkeys-lru

# Cache TTL Configuration (in seconds)
CACHE_TTL_QUERY_RESULTS=3600
CACHE_TTL_EMBEDDINGS=86400
CACHE_TTL_HEALTH_CHECKS=300

# Embedding Configuration
EMBEDDING_PROVIDER=sentence-transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_API_KEY=
EMBEDDING_DIMENSION=384
EMBEDDING_BATCH_SIZE=32
EMBEDDING_TIMEOUT=30000

# Search Configuration
SEARCH_DEFAULT_TOP_K=10
SEARCH_MAX_TOP_K=100
SEARCH_SIMILARITY_THRESHOLD=0.7

# Hybrid Search Configuration
HYBRID_SEARCH_ENABLED=true
HYBRID_SEARCH_VECTOR_WEIGHT=0.7
HYBRID_SEARCH_KEYWORD_WEIGHT=0.3

# Reranking Configuration
RERANKING_ENABLED=false
RERANKING_MODEL=

# Monitoring Configuration
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
`;
        return template;
    }
}

// Export singleton instance
export const envValidator = EnvironmentValidator.getInstance();