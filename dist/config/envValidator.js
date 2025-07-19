"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidator = exports.EnvironmentValidator = void 0;
const dotenv = __importStar(require("dotenv"));
const joi_1 = __importDefault(require("joi"));
dotenv.config();
const envSchema = joi_1.default.object({
    PORT: joi_1.default.number().port().default(3000),
    HOST: joi_1.default.string().hostname().default('0.0.0.0'),
    NODE_ENV: joi_1.default.string().valid('development', 'production', 'test').default('development'),
    CORS_ENABLED: joi_1.default.boolean().default(true),
    CORS_ORIGINS: joi_1.default.string().default('*'),
    RATE_LIMIT_WINDOW_MS: joi_1.default.number().integer().min(1000).max(3600000).default(60000),
    RATE_LIMIT_MAX_REQUESTS: joi_1.default.number().integer().min(1).max(10000).default(100),
    SERVER_TIMEOUT: joi_1.default.number().integer().min(1000).max(300000).default(30000),
    VECTOR_DB_PROVIDER: joi_1.default.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').default('faiss'),
    VECTOR_DB_CONNECTION_STRING: joi_1.default.string().optional(),
    VECTOR_DB_API_KEY: joi_1.default.string().optional(),
    VECTOR_DB_INDEX_NAME: joi_1.default.string().default('rag-index'),
    VECTOR_DB_DIMENSION: joi_1.default.number().integer().min(1).max(10000).default(384),
    METADATA_DB_PROVIDER: joi_1.default.string().valid('postgresql', 'mongodb', 'sqlite').default('sqlite'),
    METADATA_DB_CONNECTION_STRING: joi_1.default.string().default('sqlite://./data/metadata.db'),
    REDIS_HOST: joi_1.default.string().hostname().default('localhost'),
    REDIS_PORT: joi_1.default.number().port().default(6379),
    REDIS_PASSWORD: joi_1.default.string().optional(),
    REDIS_DB: joi_1.default.number().integer().min(0).max(15).default(0),
    REDIS_MAX_MEMORY: joi_1.default.string().pattern(/^\d+[kmg]b$/i).default('256mb'),
    REDIS_EVICTION_POLICY: joi_1.default.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').default('allkeys-lru'),
    CACHE_TTL_QUERY_RESULTS: joi_1.default.number().integer().min(60).max(86400).default(3600),
    CACHE_TTL_EMBEDDINGS: joi_1.default.number().integer().min(300).max(604800).default(86400),
    CACHE_TTL_HEALTH_CHECKS: joi_1.default.number().integer().min(30).max(3600).default(300),
    EMBEDDING_PROVIDER: joi_1.default.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').default('sentence-transformers'),
    EMBEDDING_MODEL: joi_1.default.string().default('all-MiniLM-L6-v2'),
    EMBEDDING_API_KEY: joi_1.default.string().optional(),
    EMBEDDING_DIMENSION: joi_1.default.number().integer().min(1).max(10000).default(384),
    EMBEDDING_BATCH_SIZE: joi_1.default.number().integer().min(1).max(1000).default(32),
    EMBEDDING_TIMEOUT: joi_1.default.number().integer().min(1000).max(300000).default(30000),
    SEARCH_DEFAULT_TOP_K: joi_1.default.number().integer().min(1).max(1000).default(10),
    SEARCH_MAX_TOP_K: joi_1.default.number().integer().min(1).max(1000).default(100),
    SEARCH_SIMILARITY_THRESHOLD: joi_1.default.number().min(0).max(1).default(0.7),
    HYBRID_SEARCH_ENABLED: joi_1.default.boolean().default(true),
    HYBRID_SEARCH_VECTOR_WEIGHT: joi_1.default.number().min(0).max(1).default(0.7),
    HYBRID_SEARCH_KEYWORD_WEIGHT: joi_1.default.number().min(0).max(1).default(0.3),
    RERANKING_ENABLED: joi_1.default.boolean().default(false),
    RERANKING_MODEL: joi_1.default.string().optional(),
    METRICS_ENABLED: joi_1.default.boolean().default(true),
    METRICS_PORT: joi_1.default.number().port().default(9090),
    METRICS_PATH: joi_1.default.string().default('/metrics'),
    LOG_LEVEL: joi_1.default.string().valid('debug', 'info', 'warn', 'error').default('info'),
    LOG_FORMAT: joi_1.default.string().valid('json', 'text').default('json'),
    LOG_FILE: joi_1.default.string().optional(),
    HEALTH_CHECK_INTERVAL: joi_1.default.number().integer().min(1000).max(300000).default(30000),
    HEALTH_CHECK_TIMEOUT: joi_1.default.number().integer().min(1000).max(60000).default(5000)
}).unknown(true);
class EnvironmentValidator {
    constructor() {
        this.validatedEnv = null;
    }
    static getInstance() {
        if (!EnvironmentValidator.instance) {
            EnvironmentValidator.instance = new EnvironmentValidator();
        }
        return EnvironmentValidator.instance;
    }
    validateEnvironment() {
        const errors = [];
        const warnings = [];
        try {
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
            this.performCustomValidations(value, errors, warnings);
            this.validatedEnv = value;
            return {
                valid: errors.length === 0,
                errors,
                warnings,
                sanitizedEnv: value
            };
        }
        catch (err) {
            errors.push(`Environment validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return {
                valid: false,
                errors,
                warnings,
                sanitizedEnv: {}
            };
        }
    }
    performCustomValidations(env, errors, warnings) {
        const vectorWeight = parseFloat(env.HYBRID_SEARCH_VECTOR_WEIGHT || '0.7');
        const keywordWeight = parseFloat(env.HYBRID_SEARCH_KEYWORD_WEIGHT || '0.3');
        if (Math.abs(vectorWeight + keywordWeight - 1) > 0.001) {
            errors.push('HYBRID_SEARCH_VECTOR_WEIGHT and HYBRID_SEARCH_KEYWORD_WEIGHT must sum to 1.0');
        }
        const embeddingDim = parseInt(env.EMBEDDING_DIMENSION || '384');
        const vectorDbDim = parseInt(env.VECTOR_DB_DIMENSION || '384');
        if (embeddingDim !== vectorDbDim) {
            errors.push('EMBEDDING_DIMENSION must match VECTOR_DB_DIMENSION');
        }
        if (env.EMBEDDING_PROVIDER === 'openai' && !env.EMBEDDING_API_KEY) {
            errors.push('EMBEDDING_API_KEY is required when using OpenAI embedding provider');
        }
        if (env.VECTOR_DB_PROVIDER === 'pinecone' && !env.VECTOR_DB_API_KEY) {
            errors.push('VECTOR_DB_API_KEY is required when using Pinecone vector database');
        }
        if (env.METADATA_DB_PROVIDER !== 'sqlite' && !env.METADATA_DB_CONNECTION_STRING) {
            errors.push('METADATA_DB_CONNECTION_STRING is required for non-SQLite database providers');
        }
        if (env.EMBEDDING_BATCH_SIZE > 100) {
            warnings.push('EMBEDDING_BATCH_SIZE > 100 may cause memory issues');
        }
        if (env.SEARCH_MAX_TOP_K > 500) {
            warnings.push('SEARCH_MAX_TOP_K > 500 may impact performance');
        }
        if (env.NODE_ENV === 'production') {
            if (env.CORS_ORIGINS === '*') {
                warnings.push('CORS_ORIGINS should not be "*" in production');
            }
            if (!env.REDIS_PASSWORD) {
                warnings.push('REDIS_PASSWORD should be set in production');
            }
        }
    }
    getValidatedEnvironment() {
        if (!this.validatedEnv) {
            const result = this.validateEnvironment();
            if (!result.valid) {
                throw new Error(`Environment validation failed: ${result.errors.join(', ')}`);
            }
        }
        return this.validatedEnv;
    }
    getEnvironmentVariable(key, defaultValue) {
        const env = this.getValidatedEnvironment();
        return env[key] !== undefined ? env[key] : defaultValue;
    }
    isProduction() {
        return this.getEnvironmentVariable('NODE_ENV') === 'production';
    }
    isDevelopment() {
        return this.getEnvironmentVariable('NODE_ENV') === 'development';
    }
    isTest() {
        return this.getEnvironmentVariable('NODE_ENV') === 'test';
    }
    generateEnvTemplate() {
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
exports.EnvironmentValidator = EnvironmentValidator;
exports.envValidator = EnvironmentValidator.getInstance();
//# sourceMappingURL=envValidator.js.map