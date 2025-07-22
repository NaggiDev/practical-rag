import Redis from 'ioredis';
import { SystemConfig } from '../../models/config';
interface Migration {
    id: string;
    name: string;
    up(config: SystemConfig): Promise<void>;
    down(config: SystemConfig): Promise<void>;
}
export declare const redisCacheSetupMigration: Migration & {
    configureRedisSettings(redis: Redis, config: SystemConfig): Promise<void>;
    setupCacheNamespaces(redis: Redis): Promise<void>;
};
export {};
//# sourceMappingURL=003_redis_cache_setup.d.ts.map