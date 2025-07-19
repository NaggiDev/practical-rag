import dotenv from 'dotenv';
import { ConfigManager } from './config';

// Load environment variables
dotenv.config();

async function main() {
    try {
        // Initialize configuration
        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig();

        console.log('Fast RAG System starting...');
        console.log(`Server will run on ${config.server.host}:${config.server.port}`);
        console.log(`Vector DB: ${config.database.vector.provider}`);
        console.log(`Embedding provider: ${config.embedding.provider}`);

        // TODO: Initialize and start services
        // This will be implemented in subsequent tasks

    } catch (error) {
        console.error('Failed to start Fast RAG System:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export * from './api';
export * from './config';
export * from './data';
export * from './models';
export * from './services';
export * from './utils';
