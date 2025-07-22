import fs from 'fs/promises';
import path from 'path';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';
import { Migration } from './migrationRunner';

export const vectorDatabaseInitMigration: Migration = {
    id: '002',
    name: 'Vector Database Initialization',

    async up(config: SystemConfig): Promise<void> {
        const { provider, dimension, indexName } = config.database.vector;

        logger.info(`Initializing vector database: ${provider}`);

        switch (provider) {
            case 'faiss':
                await this.initializeFaiss(config);
                break;
            case 'pinecone':
                await this.initializePinecone(config);
                break;
            case 'qdrant':
                await this.initializeQdrant(config);
                break;
            case 'weaviate':
                await this.initializeWeaviate(config);
                break;
            default:
                throw new Error(`Unsupported vector database provider: ${provider}`);
        }

        logger.info(`Vector database initialized successfully: ${provider}`);
    },

    async down(config: SystemConfig): Promise<void> {
        const { provider } = config.database.vector;

        logger.info(`Cleaning up vector database: ${provider}`);

        switch (provider) {
            case 'faiss':
                await this.cleanupFaiss(config);
                break;
            case 'pinecone':
                await this.cleanupPinecone(config);
                break;
            case 'qdrant':
                await this.cleanupQdrant(config);
                break;
            case 'weaviate':
                await this.cleanupWeaviate(config);
                break;
            default:
                logger.warn(`No cleanup implemented for provider: ${provider}`);
        }

        logger.info(`Vector database cleanup completed: ${provider}`);
    },

    async initializeFaiss(config: SystemConfig): Promise<void> {
        const indexDir = path.join(process.cwd(), 'data', 'vector-index');
        await fs.mkdir(indexDir, { recursive: true });

        // Create index metadata file
        const indexMetadata = {
            provider: 'faiss',
            dimension: config.database.vector.dimension,
            indexName: config.database.vector.indexName,
            createdAt: new Date().toISOString(),
            version: '1.0.0'
        };

        await fs.writeFile(
            path.join(indexDir, 'index.metadata.json'),
            JSON.stringify(indexMetadata, null, 2)
        );

        logger.info(`FAISS index directory created: ${indexDir}`);
    },

    async initializePinecone(config: SystemConfig): Promise<void> {
        // Pinecone initialization would be handled by the service layer
        // This migration just ensures the configuration is valid
        const requiredEnvVars = ['VECTOR_DB_API_KEY'];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable for Pinecone: ${envVar}`);
            }
        }

        logger.info('Pinecone configuration validated');
    },

    async initializeQdrant(config: SystemConfig): Promise<void> {
        // Qdrant initialization would be handled by the service layer
        // This migration just ensures the configuration is valid
        const connectionString = config.database.vector.connectionString;

        if (!connectionString) {
            throw new Error('Qdrant connection string is required');
        }

        logger.info('Qdrant configuration validated');
    },

    async initializeWeaviate(config: SystemConfig): Promise<void> {
        // Weaviate initialization would be handled by the service layer
        // This migration just ensures the configuration is valid
        const connectionString = config.database.vector.connectionString;

        if (!connectionString) {
            throw new Error('Weaviate connection string is required');
        }

        logger.info('Weaviate configuration validated');
    },

    async cleanupFaiss(config: SystemConfig): Promise<void> {
        const indexDir = path.join(process.cwd(), 'data', 'vector-index');

        try {
            await fs.rm(indexDir, { recursive: true, force: true });
            logger.info(`FAISS index directory removed: ${indexDir}`);
        } catch (error) {
            logger.warn(`Failed to remove FAISS index directory: ${error}`);
        }
    },

    async cleanupPinecone(config: SystemConfig): Promise<void> {
        // Pinecone cleanup would be handled by the service layer
        logger.info('Pinecone cleanup - no local resources to clean');
    },

    async cleanupQdrant(config: SystemConfig): Promise<void> {
        // Qdrant cleanup would be handled by the service layer
        logger.info('Qdrant cleanup - no local resources to clean');
    },

    async cleanupWeaviate(config: SystemConfig): Promise<void> {
        // Weaviate cleanup would be handled by the service layer
        logger.info('Weaviate cleanup - no local resources to clean');
    }
};