import { SystemConfig } from '../models/config';
import { defaultConfig } from './defaults';

export interface ConfigTemplate {
    name: string;
    description: string;
    config: Partial<SystemConfig>;
}

export const configTemplates: Record<string, ConfigTemplate> = {
    development: {
        name: 'Development',
        description: 'Configuration optimized for local development',
        config: {
            server: {
                ...defaultConfig.server,
                port: 3000,
                cors: {
                    enabled: true,
                    origins: ['http://localhost:3000', 'http://localhost:3001']
                }
            },
            database: {
                ...defaultConfig.database,
                vector: {
                    ...defaultConfig.database.vector,
                    provider: 'faiss'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://./data/dev-metadata.db'
                }
            },
            cache: {
                ...defaultConfig.cache,
                redis: {
                    ...defaultConfig.cache.redis,
                    host: 'localhost',
                    port: 6379
                }
            },
            monitoring: {
                ...defaultConfig.monitoring,
                logging: {
                    ...defaultConfig.monitoring.logging,
                    level: 'debug',
                    format: 'text'
                }
            }
        }
    },

    production: {
        name: 'Production',
        description: 'Configuration optimized for production deployment',
        config: {
            server: {
                ...defaultConfig.server,
                port: 8080,
                cors: {
                    enabled: true,
                    origins: [] // Should be configured per deployment
                },
                rateLimit: {
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    maxRequests: 1000
                }
            },
            database: {
                ...defaultConfig.database,
                vector: {
                    ...defaultConfig.database.vector,
                    provider: 'pinecone' // More scalable for production
                },
                metadata: {
                    provider: 'postgresql',
                    connectionString: '' // Should be configured per deployment
                }
            },
            cache: {
                ...defaultConfig.cache,
                redis: {
                    ...defaultConfig.cache.redis,
                    host: '', // Should be configured per deployment
                    port: 6379
                },
                maxMemory: '1gb',
                ttl: {
                    queryResults: 7200, // 2 hours
                    embeddings: 172800, // 48 hours
                    healthChecks: 600 // 10 minutes
                }
            },
            monitoring: {
                ...defaultConfig.monitoring,
                logging: {
                    ...defaultConfig.monitoring.logging,
                    level: 'info',
                    format: 'json',
                    file: '/var/log/fast-rag/app.log'
                },
                metrics: {
                    ...defaultConfig.monitoring.metrics,
                    enabled: true
                }
            }
        }
    },

    testing: {
        name: 'Testing',
        description: 'Configuration optimized for automated testing',
        config: {
            server: {
                ...defaultConfig.server,
                port: 0, // Random available port
                timeout: 5000 // Shorter timeout for tests
            },
            database: {
                ...defaultConfig.database,
                vector: {
                    ...defaultConfig.database.vector,
                    provider: 'faiss',
                    indexName: 'test-index'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://:memory:'
                }
            },
            cache: {
                ...defaultConfig.cache,
                redis: {
                    ...defaultConfig.cache.redis,
                    db: 15 // Use separate Redis DB for tests
                },
                ttl: {
                    queryResults: 60, // Short TTL for tests
                    embeddings: 300,
                    healthChecks: 30
                }
            },
            monitoring: {
                ...defaultConfig.monitoring,
                logging: {
                    ...defaultConfig.monitoring.logging,
                    level: 'warn', // Reduce log noise in tests
                    format: 'text'
                },
                metrics: {
                    ...defaultConfig.monitoring.metrics,
                    enabled: false // Disable metrics in tests
                }
            }
        }
    },

    minimal: {
        name: 'Minimal',
        description: 'Minimal configuration with local file-based storage',
        config: {
            server: {
                ...defaultConfig.server,
                port: 3000
            },
            database: {
                ...defaultConfig.database,
                vector: {
                    ...defaultConfig.database.vector,
                    provider: 'faiss'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://./data/metadata.db'
                }
            },
            cache: {
                ...defaultConfig.cache,
                redis: {
                    ...defaultConfig.cache.redis,
                    host: 'localhost'
                }
            },
            embedding: {
                ...defaultConfig.embedding,
                provider: 'sentence-transformers',
                model: 'all-MiniLM-L6-v2'
            }
        }
    },

    highPerformance: {
        name: 'High Performance',
        description: 'Configuration optimized for high-throughput scenarios',
        config: {
            server: {
                ...defaultConfig.server,
                rateLimit: {
                    windowMs: 60 * 1000, // 1 minute
                    maxRequests: 10000
                },
                timeout: 60000 // 1 minute
            },
            cache: {
                ...defaultConfig.cache,
                maxMemory: '4gb',
                ttl: {
                    queryResults: 14400, // 4 hours
                    embeddings: 259200, // 72 hours
                    healthChecks: 300
                }
            },
            embedding: {
                ...defaultConfig.embedding,
                batchSize: 128, // Larger batch size
                timeout: 60000
            },
            search: {
                ...defaultConfig.search,
                defaultTopK: 20,
                maxTopK: 500
            }
        }
    }
};

export class ConfigTemplateManager {
    public static getTemplate(name: string): ConfigTemplate | undefined {
        return configTemplates[name];
    }

    public static getAvailableTemplates(): string[] {
        return Object.keys(configTemplates);
    }

    public static generateConfig(templateName: string, overrides?: Partial<SystemConfig>): SystemConfig {
        const template = this.getTemplate(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        // Deep merge template config with defaults and overrides
        const baseConfig = this.deepMerge(defaultConfig, template.config);

        if (overrides) {
            return this.deepMerge(baseConfig, overrides);
        }

        return baseConfig;
    }

    public static createCustomTemplate(
        name: string,
        description: string,
        config: Partial<SystemConfig>
    ): void {
        configTemplates[name] = {
            name,
            description,
            config
        };
    }

    public static exportTemplate(templateName: string): string {
        const template = this.getTemplate(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        return JSON.stringify(template, null, 2);
    }

    public static importTemplate(templateData: string): ConfigTemplate {
        try {
            const template = JSON.parse(templateData) as ConfigTemplate;

            if (!template.name || !template.description || !template.config) {
                throw new Error('Invalid template format');
            }

            return template;
        } catch (error) {
            throw new Error(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private static deepMerge(target: any, source: any): any {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }
}