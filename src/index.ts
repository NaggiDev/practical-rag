import dotenv from 'dotenv';
import { apiGateway } from './api/app';
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

        // Start API gateway
        await apiGateway.start();

        console.log('✅ Fast RAG System started successfully');

    } catch (error) {
        console.error('Failed to start Fast RAG System:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { ApiGateway, apiGateway } from './api/app';
export { authMiddleware, requireRole } from './api/middleware/auth';
export * from './config';
export * from './data';
export * from './models';
// Export services without conflicts
export { EmbeddingService } from './services/embedding';
export { QueryProcessor } from './services/queryProcessor';
// Export utils without conflicts
export { Logger } from './utils/logger';

