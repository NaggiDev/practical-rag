import fs from 'fs/promises';
import path from 'path';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';
import { Migration } from './migrationRunner';

// Helper functions for vector database initialization
async function initializeFaiss(config: SystemConfig): Promise<void> {
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
}

async function initializePinecone(): Promise<void> {
    // Pinecone initialization would be handled by the service layer
    // This migration just ensures the configuration is valid
    const requiredEnvVars = ['VECTOR_DB_API_KEY'];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable for Pinecone: ${envVar}`);
        }
    }

    logger.info('Pinecone configuration validated');
}

async function initializeQdrant(config: SystemConfig): Promise<void> {
    // Qdrant initialization would be handled by the service layer
    // This migration just ensures the configuration is valid
    const connectionString = config.database.vector.connectionString;

    if (!connectionString) {
        throw new Error('Qdrant connection string is required');
    }

    logger.info('Qdrant configuration validated');
}

async function initializeWeaviate(config: SystemConfig): Promise<void> {
    // Weaviate initialization would be handled by the service layer
    // This migration just ensures the configuration is valid
    const connectionString = config.database.vector.connectionString;

    if (!connectionString) {
        throw new Error('Weaviate connection string is required');
    }

    logger.info('Weaviate configuration validated');
}

async function cleanupFaiss(): Promise<void> {
    const indexDir = path.join(process.cwd(), 'data', 'vector-index');

    try {
        await fs.rm(indexDir, { recursive: true, force: true });
        logger.info(`FAISS index directory removed: ${indexDir}`);
    } catch (error) {
        logger.warn(`Failed to remove FAISS index directory: ${error}`);
    }
}

async function cleanupPinecone(): Promise<void> {
    // Pinecone cleanup would be handled by the service layer
    logger.info('Pinecone cleanup - no local resources to clean');
}

async function cleanupQdrant(): Promise<void> {
    // Qdrant cleanup would be handled by the service layer
    logger.info('Qdrant cleanup - no local resources to clean');
}

async function cleanupWeaviate(): Promise<void> {
    // Weaviate cleanup would be handled by the service layer
    logger.info('Weaviate cleanup - no local resources to clean');
}

export const vectorDatabaseInitMigration: Migration = {
    id: '002',
    name: 'Vector Database Initialization',

    async up(config: SystemConfig): Promise<void> {
        const { provider } = config.database.vector;

        logger.info(`Initializing vector database: ${provider}`);

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

        logger.info(`Vector database initialized successfully: ${provider}`);
    },

    async down(config: SystemConfig): Promise<void> {
        const { provider } = config.database.vector;

        logger.info(`Cleaning up vector database: ${provider}`);

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
                logger.warn(`No cleanup implemented for provider: ${provider}`);
        }

        logger.info(`Vector database cleanup completed: ${provider}`);
    }
};