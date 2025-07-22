"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisCacheSetupMigration = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../../utils/logger");
exports.redisCacheSetupMigration = {
    id: '003',
    name: 'Redis Cache Setup',
    async up(config) {
        logger_1.logger.info('Setting up Redis cache configuration');
        const redis = new ioredis_1.default({
            host: config.cache?.redis?.host || 'localhost',
            port: config.cache?.redis?.port || 6379,
            db: config.cache?.redis?.db || 0,
            password: config.cache?.redis?.password,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
        try {
            await redis.connect();
            await redis.ping();
            await this.configureRedisSettings(redis, config);
            await this.setupCacheNamespaces(redis);
            logger_1.logger.info('Redis cache setup completed successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to setup Redis cache', error);
            throw error;
        }
        finally {
            await redis.disconnect();
        }
    },
    async down(config) {
        logger_1.logger.info('Cleaning up Redis cache');
        const redis = new ioredis_1.default({
            host: config.cache.redis.host,
            port: config.cache.redis.port,
            db: config.cache.redis.db,
            password: config.cache.redis.password,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
        try {
            await redis.connect();
            await redis.flushdb();
            logger_1.logger.info('Redis cache cleanup completed');
        }
        catch (error) {
            logger_1.logger.warn('Failed to cleanup Redis cache', error);
        }
        finally {
            await redis.disconnect();
        }
    },
    async configureRedisSettings(redis, config) {
        const { maxMemory, evictionPolicy } = config.cache;
        try {
            if (maxMemory) {
                await redis.config('SET', 'maxmemory', maxMemory);
                logger_1.logger.info(`Redis max memory set to: ${maxMemory}`);
            }
            if (evictionPolicy) {
                await redis.config('SET', 'maxmemory-policy', evictionPolicy);
                logger_1.logger.info(`Redis eviction policy set to: ${evictionPolicy}`);
            }
            await redis.config('SET', 'notify-keyspace-events', 'Ex');
            logger_1.logger.info('Redis keyspace notifications enabled');
        }
        catch (error) {
            logger_1.logger.warn('Some Redis configuration settings could not be applied', error);
        }
    },
    async setupCacheNamespaces(redis) {
        const namespaces = [
            'rag:queries',
            'rag:embeddings',
            'rag:content',
            'rag:health',
            'rag:metrics',
            'rag:sessions'
        ];
        const namespaceInfo = {
            'rag:queries': 'Cached query results and responses',
            'rag:embeddings': 'Cached embedding vectors',
            'rag:content': 'Cached processed content and chunks',
            'rag:health': 'Health check results and status',
            'rag:metrics': 'Performance metrics and statistics',
            'rag:sessions': 'User session data and preferences'
        };
        await redis.hset('rag:namespaces', namespaceInfo);
        const defaultTTLs = {
            'rag:queries': 3600,
            'rag:embeddings': 86400,
            'rag:content': 7200,
            'rag:health': 300,
            'rag:metrics': 1800,
            'rag:sessions': 86400
        };
        await redis.hset('rag:ttl:defaults', defaultTTLs);
        logger_1.logger.info(`Cache namespaces configured: ${namespaces.join(', ')}`);
    }
};
//# sourceMappingURL=003_redis_cache_setup.js.map