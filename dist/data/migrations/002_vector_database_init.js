"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vectorDatabaseInitMigration = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../utils/logger");
async function initializeFaiss(config) {
    const indexDir = path_1.default.join(process.cwd(), 'data', 'vector-index');
    await promises_1.default.mkdir(indexDir, { recursive: true });
    const indexMetadata = {
        provider: 'faiss',
        dimension: config.database.vector.dimension,
        indexName: config.database.vector.indexName,
        createdAt: new Date().toISOString(),
        version: '1.0.0'
    };
    await promises_1.default.writeFile(path_1.default.join(indexDir, 'index.metadata.json'), JSON.stringify(indexMetadata, null, 2));
    logger_1.logger.info(`FAISS index directory created: ${indexDir}`);
}
async function initializePinecone() {
    const requiredEnvVars = ['VECTOR_DB_API_KEY'];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable for Pinecone: ${envVar}`);
        }
    }
    logger_1.logger.info('Pinecone configuration validated');
}
async function initializeQdrant(config) {
    const connectionString = config.database.vector.connectionString;
    if (!connectionString) {
        throw new Error('Qdrant connection string is required');
    }
    logger_1.logger.info('Qdrant configuration validated');
}
async function initializeWeaviate(config) {
    const connectionString = config.database.vector.connectionString;
    if (!connectionString) {
        throw new Error('Weaviate connection string is required');
    }
    logger_1.logger.info('Weaviate configuration validated');
}
async function cleanupFaiss() {
    const indexDir = path_1.default.join(process.cwd(), 'data', 'vector-index');
    try {
        await promises_1.default.rm(indexDir, { recursive: true, force: true });
        logger_1.logger.info(`FAISS index directory removed: ${indexDir}`);
    }
    catch (error) {
        logger_1.logger.warn(`Failed to remove FAISS index directory: ${error}`);
    }
}
async function cleanupPinecone() {
    logger_1.logger.info('Pinecone cleanup - no local resources to clean');
}
async function cleanupQdrant() {
    logger_1.logger.info('Qdrant cleanup - no local resources to clean');
}
async function cleanupWeaviate() {
    logger_1.logger.info('Weaviate cleanup - no local resources to clean');
}
exports.vectorDatabaseInitMigration = {
    id: '002',
    name: 'Vector Database Initialization',
    async up(config) {
        const { provider } = config.database.vector;
        logger_1.logger.info(`Initializing vector database: ${provider}`);
        switch (provider) {
            case 'faiss':
                await initializeFaiss(config);
                break;
            case 'pinecone':
                await initializePinecone();
                break;
            case 'qdrant':
                await initializeQdrant(config);
                break;
            case 'weaviate':
                await initializeWeaviate(config);
                break;
            default:
                throw new Error(`Unsupported vector database provider: ${provider}`);
        }
        logger_1.logger.info(`Vector database initialized successfully: ${provider}`);
    },
    async down(config) {
        const { provider } = config.database.vector;
        logger_1.logger.info(`Cleaning up vector database: ${provider}`);
        switch (provider) {
            case 'faiss':
                await cleanupFaiss();
                break;
            case 'pinecone':
                await cleanupPinecone();
                break;
            case 'qdrant':
                await cleanupQdrant();
                break;
            case 'weaviate':
                await cleanupWeaviate();
                break;
            default:
                logger_1.logger.warn(`No cleanup implemented for provider: ${provider}`);
        }
        logger_1.logger.info(`Vector database cleanup completed: ${provider}`);
    }
};
//# sourceMappingURL=002_vector_database_init.js.map