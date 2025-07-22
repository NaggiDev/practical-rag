"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigTemplateManager = exports.configTemplates = void 0;
const defaults_1 = require("./defaults");
exports.configTemplates = {
    development: {
        name: 'Development',
        description: 'Configuration optimized for local development',
        config: {
            server: {
                ...defaults_1.defaultConfig.server,
                port: 3000,
                cors: {
                    enabled: true,
                    origins: ['http://localhost:3000', 'http://localhost:3001']
                }
            },
            database: {
                ...defaults_1.defaultConfig.database,
                vector: {
                    ...defaults_1.defaultConfig.database.vector,
                    provider: 'faiss'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://./data/dev-metadata.db'
                }
            },
            cache: {
                ...defaults_1.defaultConfig.cache,
                redis: {
                    ...defaults_1.defaultConfig.cache.redis,
                    host: 'localhost',
                    port: 6379
                }
            },
            monitoring: {
                ...defaults_1.defaultConfig.monitoring,
                logging: {
                    ...defaults_1.defaultConfig.monitoring.logging,
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
                ...defaults_1.defaultConfig.server,
                port: 8080,
                cors: {
                    enabled: true,
                    origins: []
                },
                rateLimit: {
                    windowMs: 15 * 60 * 1000,
                    maxRequests: 1000
                }
            },
            database: {
                ...defaults_1.defaultConfig.database,
                vector: {
                    ...defaults_1.defaultConfig.database.vector,
                    provider: 'pinecone'
                },
                metadata: {
                    provider: 'postgresql',
                    connectionString: ''
                }
            },
            cache: {
                ...defaults_1.defaultConfig.cache,
                redis: {
                    ...defaults_1.defaultConfig.cache.redis,
                    host: '',
                    port: 6379
                },
                maxMemory: '1gb',
                ttl: {
                    queryResults: 7200,
                    embeddings: 172800,
                    healthChecks: 600
                }
            },
            monitoring: {
                ...defaults_1.defaultConfig.monitoring,
                logging: {
                    ...defaults_1.defaultConfig.monitoring.logging,
                    level: 'info',
                    format: 'json',
                    file: '/var/log/fast-rag/app.log'
                },
                metrics: {
                    ...defaults_1.defaultConfig.monitoring.metrics,
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
                ...defaults_1.defaultConfig.server,
                port: 0,
                timeout: 5000
            },
            database: {
                ...defaults_1.defaultConfig.database,
                vector: {
                    ...defaults_1.defaultConfig.database.vector,
                    provider: 'faiss',
                    indexName: 'test-index'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://:memory:'
                }
            },
            cache: {
                ...defaults_1.defaultConfig.cache,
                redis: {
                    ...defaults_1.defaultConfig.cache.redis,
                    db: 15
                },
                ttl: {
                    queryResults: 60,
                    embeddings: 300,
                    healthChecks: 30
                }
            },
            monitoring: {
                ...defaults_1.defaultConfig.monitoring,
                logging: {
                    ...defaults_1.defaultConfig.monitoring.logging,
                    level: 'warn',
                    format: 'text'
                },
                metrics: {
                    ...defaults_1.defaultConfig.monitoring.metrics,
                    enabled: false
                }
            }
        }
    },
    minimal: {
        name: 'Minimal',
        description: 'Minimal configuration with local file-based storage',
        config: {
            server: {
                ...defaults_1.defaultConfig.server,
                port: 3000
            },
            database: {
                ...defaults_1.defaultConfig.database,
                vector: {
                    ...defaults_1.defaultConfig.database.vector,
                    provider: 'faiss'
                },
                metadata: {
                    provider: 'sqlite',
                    connectionString: 'sqlite://./data/metadata.db'
                }
            },
            cache: {
                ...defaults_1.defaultConfig.cache,
                redis: {
                    ...defaults_1.defaultConfig.cache.redis,
                    host: 'localhost'
                }
            },
            embedding: {
                ...defaults_1.defaultConfig.embedding,
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
                ...defaults_1.defaultConfig.server,
                rateLimit: {
                    windowMs: 60 * 1000,
                    maxRequests: 10000
                },
                timeout: 60000
            },
            cache: {
                ...defaults_1.defaultConfig.cache,
                maxMemory: '4gb',
                ttl: {
                    queryResults: 14400,
                    embeddings: 259200,
                    healthChecks: 300
                }
            },
            embedding: {
                ...defaults_1.defaultConfig.embedding,
                batchSize: 128,
                timeout: 60000
            },
            search: {
                ...defaults_1.defaultConfig.search,
                defaultTopK: 20,
                maxTopK: 500
            }
        }
    }
};
class ConfigTemplateManager {
    static getTemplate(name) {
        return exports.configTemplates[name];
    }
    static getAvailableTemplates() {
        return Object.keys(exports.configTemplates);
    }
    static generateConfig(templateName, overrides) {
        const template = this.getTemplate(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }
        const baseConfig = this.deepMerge(defaults_1.defaultConfig, template.config);
        if (overrides) {
            return this.deepMerge(baseConfig, overrides);
        }
        return baseConfig;
    }
    static createCustomTemplate(name, description, config) {
        exports.configTemplates[name] = {
            name,
            description,
            config
        };
    }
    static exportTemplate(templateName) {
        const template = this.getTemplate(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }
        return JSON.stringify(template, null, 2);
    }
    static importTemplate(templateData) {
        try {
            const template = JSON.parse(templateData);
            if (!template.name || !template.description || !template.config) {
                throw new Error('Invalid template format');
            }
            return template;
        }
        catch (error) {
            throw new Error(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            }
            else {
                result[key] = source[key];
            }
        }
        return result;
    }
}
exports.ConfigTemplateManager = ConfigTemplateManager;
//# sourceMappingURL=templates.js.map