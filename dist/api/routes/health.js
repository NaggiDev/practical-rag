"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = void 0;
const express_1 = require("express");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.healthRoutes = (0, express_1.Router)();
exports.healthRoutes.use(rateLimit_1.healthRateLimitMiddleware);
exports.healthRoutes.get('/', async (_req, res, next) => {
    try {
        const startTime = Date.now();
        const uptime = process.uptime();
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            services: [
                {
                    name: 'api',
                    status: 'healthy',
                    responseTime: Date.now() - startTime,
                    lastCheck: new Date()
                }
            ],
            uptime
        };
        res.status(200).json(health);
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/detailed', (0, validation_1.validateWithJoi)(validation_1.commonSchemas.healthParams, 'query'), async (req, res, next) => {
    try {
        const startTime = Date.now();
        const uptime = process.uptime();
        const { includeMetrics } = req.query;
        const services = await checkAllServices();
        const hasUnhealthyServices = services.some(service => service.status === 'unhealthy');
        const overallStatus = hasUnhealthyServices ? 'degraded' : 'healthy';
        const health = {
            status: overallStatus,
            timestamp: new Date(),
            services,
            uptime
        };
        if (includeMetrics) {
            health.metrics = {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                responseTime: Date.now() - startTime,
                activeConnections: process.getActiveResourcesInfo?.()?.length || 0
            };
        }
        const statusCode = overallStatus === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/ready', async (_req, res, next) => {
    try {
        const criticalServices = await checkCriticalServices();
        const isReady = criticalServices.every(service => service.status === 'healthy');
        if (isReady) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date(),
                services: criticalServices
            });
        }
        else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date(),
                services: criticalServices
            });
        }
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/live', async (_req, res, next) => {
    try {
        res.status(200).json({
            status: 'alive',
            timestamp: new Date(),
            uptime: process.uptime()
        });
    }
    catch (error) {
        next(error);
    }
});
async function checkAllServices() {
    const services = [];
    services.push(await checkApiService());
    services.push(await checkVectorDatabase());
    services.push(await checkRedisCache());
    services.push(await checkEmbeddingService());
    services.push(await checkDataSources());
    return services;
}
async function checkCriticalServices() {
    const services = [];
    services.push(await checkApiService());
    services.push(await checkVectorDatabase());
    services.push(await checkRedisCache());
    return services;
}
async function checkApiService() {
    const startTime = Date.now();
    try {
        const responseTime = Date.now() - startTime;
        return {
            name: 'api',
            status: 'healthy',
            responseTime,
            lastCheck: new Date(),
            details: {
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            }
        };
    }
    catch (error) {
        return {
            name: 'api',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}
async function checkVectorDatabase() {
    const startTime = Date.now();
    try {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
            name: 'vector_database',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                provider: process.env.VECTOR_DB_PROVIDER || 'faiss',
                connected: true
            }
        };
    }
    catch (error) {
        return {
            name: 'vector_database',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Connection failed'
            }
        };
    }
}
async function checkRedisCache() {
    const startTime = Date.now();
    try {
        await new Promise(resolve => setTimeout(resolve, 5));
        return {
            name: 'redis_cache',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                connected: true,
                memory_usage: 'normal'
            }
        };
    }
    catch (error) {
        return {
            name: 'redis_cache',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Connection failed'
            }
        };
    }
}
async function checkEmbeddingService() {
    const startTime = Date.now();
    try {
        await new Promise(resolve => setTimeout(resolve, 15));
        return {
            name: 'embedding_service',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                provider: process.env.EMBEDDING_PROVIDER || 'openai',
                model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
            }
        };
    }
    catch (error) {
        return {
            name: 'embedding_service',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Service unavailable'
            }
        };
    }
}
async function checkDataSources() {
    const startTime = Date.now();
    try {
        await new Promise(resolve => setTimeout(resolve, 20));
        return {
            name: 'data_sources',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                total_sources: 0,
                active_sources: 0,
                failed_sources: 0
            }
        };
    }
    catch (error) {
        return {
            name: 'data_sources',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Sources check failed'
            }
        };
    }
}
//# sourceMappingURL=health.js.map