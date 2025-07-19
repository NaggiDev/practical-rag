import { EnvironmentValidator } from '../../config/envValidator';

describe('EnvironmentValidator', () => {
    let envValidator: EnvironmentValidator;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        envValidator = EnvironmentValidator.getInstance();
        originalEnv = { ...process.env };
        // Clear the validated environment cache
        (envValidator as any).validatedEnv = null;
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('Environment Validation', () => {
        it('should validate valid environment variables', () => {
            // Set valid environment variables
            process.env.PORT = '3000';
            process.env.HOST = 'localhost';
            process.env.NODE_ENV = 'development';
            process.env.VECTOR_DB_DIMENSION = '384';
            process.env.EMBEDDING_DIMENSION = '384';

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect invalid port number', () => {
            process.env.PORT = 'invalid-port';

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('PORT'))).toBe(true);
        });

        it('should detect invalid NODE_ENV', () => {
            process.env.NODE_ENV = 'invalid-env';

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('NODE_ENV'))).toBe(true);
        });

        it('should validate hybrid search weights', () => {
            process.env.HYBRID_SEARCH_VECTOR_WEIGHT = '0.8';
            process.env.HYBRID_SEARCH_KEYWORD_WEIGHT = '0.3'; // Sum > 1

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('must sum to 1.0'))).toBe(true);
        });

        it('should validate embedding and vector database dimension match', () => {
            process.env.EMBEDDING_DIMENSION = '512';
            process.env.VECTOR_DB_DIMENSION = '384'; // Mismatch

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('EMBEDDING_DIMENSION must match VECTOR_DB_DIMENSION'))).toBe(true);
        });

        it('should require API key for OpenAI provider', () => {
            process.env.EMBEDDING_PROVIDER = 'openai';
            // Missing EMBEDDING_API_KEY

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('EMBEDDING_API_KEY is required'))).toBe(true);
        });

        it('should require API key for Pinecone provider', () => {
            process.env.VECTOR_DB_PROVIDER = 'pinecone';
            // Missing VECTOR_DB_API_KEY

            const result = envValidator.validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.includes('VECTOR_DB_API_KEY is required'))).toBe(true);
        });
    });

    describe('Environment Warnings', () => {
        it('should warn about large batch sizes', () => {
            process.env.EMBEDDING_BATCH_SIZE = '200';

            const result = envValidator.validateEnvironment();

            expect(result.warnings.some(warning => warning.includes('EMBEDDING_BATCH_SIZE > 100'))).toBe(true);
        });

        it('should warn about large top K values', () => {
            process.env.SEARCH_MAX_TOP_K = '1000';

            const result = envValidator.validateEnvironment();

            expect(result.warnings.some(warning => warning.includes('SEARCH_MAX_TOP_K > 500'))).toBe(true);
        });

        it('should warn about production security issues', () => {
            process.env.NODE_ENV = 'production';
            process.env.CORS_ORIGINS = '*';
            // Missing REDIS_PASSWORD

            const result = envValidator.validateEnvironment();

            expect(result.warnings.some(warning => warning.includes('CORS_ORIGINS should not be "*" in production'))).toBe(true);
            expect(result.warnings.some(warning => warning.includes('REDIS_PASSWORD should be set in production'))).toBe(true);
        });
    });

    describe('Environment Variable Access', () => {
        it('should get validated environment variables', () => {
            // Clear cache first
            (envValidator as any).validatedEnv = null;
            process.env.PORT = '4000';
            process.env.REDIS_HOST = 'test-redis';

            const env = envValidator.getValidatedEnvironment();

            expect(env.PORT).toBe(4000); // Converted to number
            expect(env.REDIS_HOST).toBe('test-redis');
        });

        it('should get specific environment variable with default', () => {
            const port = envValidator.getEnvironmentVariable('PORT', 5000);
            const customVar = envValidator.getEnvironmentVariable('CUSTOM_VAR', 'default-value');

            expect(typeof port).toBe('number');
            expect(customVar).toBe('default-value');
        });

        it('should detect environment types', () => {
            // Clear cache and set production
            (envValidator as any).validatedEnv = null;
            process.env.NODE_ENV = 'production';
            expect(envValidator.isProduction()).toBe(true);
            expect(envValidator.isDevelopment()).toBe(false);
            expect(envValidator.isTest()).toBe(false);

            // Clear cache and set development
            (envValidator as any).validatedEnv = null;
            process.env.NODE_ENV = 'development';
            expect(envValidator.isProduction()).toBe(false);
            expect(envValidator.isDevelopment()).toBe(true);
            expect(envValidator.isTest()).toBe(false);

            // Clear cache and set test
            (envValidator as any).validatedEnv = null;
            process.env.NODE_ENV = 'test';
            expect(envValidator.isProduction()).toBe(false);
            expect(envValidator.isDevelopment()).toBe(false);
            expect(envValidator.isTest()).toBe(true);
        });
    });

    describe('Environment Template Generation', () => {
        it('should generate environment template', () => {
            const template = envValidator.generateEnvTemplate();

            expect(template).toContain('PORT=3000');
            expect(template).toContain('REDIS_HOST=localhost');
            expect(template).toContain('EMBEDDING_PROVIDER=sentence-transformers');
            expect(template).toContain('# Server Configuration');
            expect(template).toContain('# Vector Database Configuration');
        });
    });

    describe('Default Values', () => {
        it('should apply default values for missing environment variables', () => {
            // Clear all environment variables
            for (const key in process.env) {
                if (key.startsWith('PORT') || key.startsWith('REDIS') || key.startsWith('EMBEDDING')) {
                    delete process.env[key];
                }
            }

            const result = envValidator.validateEnvironment();

            expect(result.sanitizedEnv.PORT).toBe(3000);
            expect(result.sanitizedEnv.REDIS_HOST).toBe('localhost');
            expect(result.sanitizedEnv.EMBEDDING_PROVIDER).toBe('sentence-transformers');
        });
    });

    describe('Type Conversion', () => {
        it('should convert string numbers to numbers', () => {
            process.env.PORT = '8080';
            process.env.REDIS_PORT = '6380';

            const result = envValidator.validateEnvironment();

            expect(typeof result.sanitizedEnv.PORT).toBe('number');
            expect(result.sanitizedEnv.PORT).toBe(8080);
            expect(typeof result.sanitizedEnv.REDIS_PORT).toBe('number');
            expect(result.sanitizedEnv.REDIS_PORT).toBe(6380);
        });

        it('should convert string booleans to booleans', () => {
            process.env.CORS_ENABLED = 'false';
            process.env.METRICS_ENABLED = 'true';

            const result = envValidator.validateEnvironment();

            expect(typeof result.sanitizedEnv.CORS_ENABLED).toBe('boolean');
            expect(result.sanitizedEnv.CORS_ENABLED).toBe(false);
            expect(typeof result.sanitizedEnv.METRICS_ENABLED).toBe('boolean');
            expect(result.sanitizedEnv.METRICS_ENABLED).toBe(true);
        });
    });
});