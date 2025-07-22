import Redis from 'ioredis';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';
import { Migration } from './migrationRunner';

export const redisCacheSetupMigration: Migration = {
    id: '003',
    name: 'Redis Cache Setup',

    async up(config: SystemConfig): Promise<void> {
        logger.info('Setting up Redis cache configuration');

        const redis = new Redis({
            host: config.cache.redis.host,
            port: config.cache.redis.port,
            db: config.cache.redis.db,
            password: config.cache.redis.password,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        try {
            // Test connection
            await redis.connect();
            await redis.ping();

            // Configure Redis settings
            await this.configureRedisSettings(redis, config);

            // Create cache key namespaces
            await this.setupCacheNamespaces(redis);

            logger.info('Redis cache setup completed successfully');
        } catch (error) {
            logger.error('Failed to setup Redis cache', error);
            throw error;
        } finally {
            await redis.disconnect();
        }
    },

    async down(config: SystemConfig): Promise<void> {
        logger.info('Cleaning up Redis cache');

        const redis = new Redis({
            host: config.cache.redis.host,
            port: config.cache.redis.port,
            db: config.cache.redis.db,
            password: config.cache.redis.password,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        try {
            await redis.connect();

            // Clear all cache data
            await redis.flushdb();

            logger.info('Redis cache cleanup completed');
        } catch (error) {
            logger.warn('Failed to cleanup Redis cache', error);
        } finally {
            await redis.disconnect();
        }
    },

    async configureRedisSettings(redis: Redis, config: SystemConfig): Promise<void> {
        const { maxMemory, evictionPolicy } = config.cache;

        try {
            // Set memory limit
            if (maxMemory) {
                await redis.config('SET', 'maxmemory', maxMemory);
                logger.info(`Redis max memory set to: ${maxMemory}`);
            }

            // Set eviction policy
            if (evictionPolicy) {
                await redis.config('SET', 'maxmemory-policy', evictionPolicy);
                logger.info(`Redis eviction policy set to: ${evictionPolicy}`);
            }

            // Enable keyspace notifications for cache invalidation
            await redis.config('SET', 'notify-keyspace-events', 'Ex');
            logger.info('Redis keyspace notifications enabled');

        } catch (error) {
            logger.warn('Some Redis configuration settings could not be applied', error);
        }
    },

    async setupCacheNamespaces(redis: Redis): Promise<void> {
        const namespaces = [
            'rag:queries',
            'rag:embeddings',
            'rag:content',
            'rag:health',
            'rag:metrics',
            'rag:sessions'
        ];

        // Create namespace documentation
        const namespaceInfo = {
            'rag:queries': 'Cached query results and responses',
            'rag:embeddings': 'Cached embedding vectors',
            'rag:content': 'Cached processed content and chunks',
            'rag:health': 'Health check results and status',
            'rag:metrics': 'Performance metrics and statistics',
            'rag:sessions': 'User session data and preferences'
        };

        // Store namespace documentation
        await redis.hset('rag:namespaces', namespaceInfo);

        // Set up default TTL for each namespace
        const defaultTTLs = {
            'rag:queries': 3600,      // 1 hour
            'rag:embeddings': 86400,  // 24 hours
            'rag:content': 7200,      // 2 hours
            'rag:health': 300,        // 5 minutes
            'rag:metrics': 1800,      // 30 minutes
            'rag:sessions': 86400     // 24 hours
        };

        await redis.hset('rag:ttl:defaults', defaultTTLs);

        logger.info(`Cache namespaces configured: ${namespaces.join(', ')}`);
    }
};