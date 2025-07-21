import compression from 'compression';
import cors from 'cors';
import express, { Application, json, NextFunction, Request, Response, urlencoded } from 'express';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';

// Import middleware
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { validationErrorHandler } from './middleware/validation';

// Import routes
import { healthRoutes } from './routes/health';
import { queryRoutes } from './routes/query';
import { sourcesRoutes } from './routes/sources';

// Import models for error handling
import { ErrorResponse } from '../models/response';

export interface ApiRequest extends Request {
    correlationId: string;
    userId?: string;
    startTime: number;
}

export interface AuthenticatedRequest extends ApiRequest {
    userId: string;
    userRole?: string;
}

export class ApiGateway {
    private app: Application;
    private readonly port: number;
    private readonly host: string;

    constructor(port: number = 3000, host: string = '0.0.0.0') {
        this.app = express();
        this.port = port;
        this.host = host;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
            credentials: true,
            maxAge: 86400 // 24 hours
        }));

        // Compression
        this.app.use(compression({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            },
            threshold: 1024 // Only compress responses larger than 1KB
        }));

        // Body parsing
        this.app.use(json({
            limit: '10mb',
            type: ['application/json']
        }));
        this.app.use(urlencoded({
            extended: true,
            limit: '10mb'
        }));

        // Request correlation ID and timing
        this.app.use((req: any, res: Response, next: NextFunction) => {
            req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
            req.startTime = Date.now();

            // Set correlation ID in response headers
            res.setHeader('X-Correlation-ID', req.correlationId);

            next();
        });

        // Rate limiting
        this.app.use(rateLimitMiddleware);

        // Authentication (applied to protected routes)
        this.app.use('/api/v1/query', authMiddleware as any);
        this.app.use('/api/v1/sources', authMiddleware as any);
    }

    private setupRoutes(): void {
        // API versioning
        const apiV1 = express.Router();

        // Mount route handlers
        apiV1.use('/health', healthRoutes);
        apiV1.use('/query', queryRoutes);
        apiV1.use('/sources', sourcesRoutes);

        // Mount API version
        this.app.use('/api/v1', apiV1);

        // Root endpoint
        this.app.get('/', (_req: Request, res: Response) => {
            res.json({
                name: 'Fast RAG System API',
                version: '1.0.0',
                status: 'running',
                timestamp: new Date().toISOString(),
                endpoints: {
                    health: '/api/v1/health',
                    query: '/api/v1/query',
                    sources: '/api/v1/sources'
                }
            });
        });

        // API documentation endpoint
        this.app.get('/api/v1', (_req: Request, res: Response) => {
            res.json({
                version: '1.0.0',
                endpoints: {
                    'GET /health': 'System health check',
                    'GET /health/detailed': 'Detailed system health with component status',
                    'POST /query': 'Submit a query for processing',
                    'GET /sources': 'List all configured data sources',
                    'POST /sources': 'Add a new data source',
                    'POST /sources/validate': 'Validate data source configuration without saving',
                    'GET /sources/:id': 'Get specific data source details',
                    'PUT /sources/:id': 'Update data source configuration',
                    'DELETE /sources/:id': 'Remove a data source',
                    'POST /sources/:id/sync': 'Trigger manual sync for a data source',
                    'GET /sources/:id/health': 'Get data source health status'
                }
            });
        });

        // 404 handler for unknown routes
        this.app.use('*', (req: Request, res: Response) => {
            const error: ErrorResponse = {
                error: {
                    code: 'ROUTE_NOT_FOUND',
                    message: `Route ${req.method} ${req.originalUrl} not found`,
                    timestamp: new Date(),
                    correlationId: (req as ApiRequest).correlationId || uuidv4()
                }
            };
            res.status(404).json(error);
        });
    }

    private setupErrorHandling(): void {
        // Validation error handler
        this.app.use(validationErrorHandler as any);

        // Global error handler
        this.app.use((error: any, req: any, res: Response, _next: NextFunction) => {
            const correlationId = req.correlationId || uuidv4();
            const timestamp = new Date();

            // Log error (in production, use proper logging)
            console.error(`[${timestamp.toISOString()}] [${correlationId}] Error:`, {
                message: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                body: req.body,
                query: req.query,
                params: req.params
            });

            // Determine error type and status code
            let statusCode = 500;
            let errorCode = 'INTERNAL_SERVER_ERROR';
            let message = 'An internal server error occurred';

            if (error.name === 'ValidationError') {
                statusCode = 400;
                errorCode = 'VALIDATION_ERROR';
                message = error.message;
            } else if (error.name === 'UnauthorizedError') {
                statusCode = 401;
                errorCode = 'UNAUTHORIZED';
                message = error.message || 'Authentication required';
            } else if (error.name === 'ForbiddenError') {
                statusCode = 403;
                errorCode = 'FORBIDDEN';
                message = error.message || 'Access denied';
            } else if (error.name === 'NotFoundError') {
                statusCode = 404;
                errorCode = 'NOT_FOUND';
                message = error.message || 'Resource not found';
            } else if (error.name === 'ConflictError') {
                statusCode = 409;
                errorCode = 'CONFLICT';
                message = error.message;
            } else if (error.name === 'RateLimitError') {
                statusCode = 429;
                errorCode = 'RATE_LIMIT_EXCEEDED';
                message = 'Rate limit exceeded';
            } else if (error.status) {
                statusCode = error.status;
                errorCode = error.code || 'HTTP_ERROR';
                message = error.message;
            }

            const errorResponse: ErrorResponse = {
                error: {
                    code: errorCode,
                    message,
                    details: process.env.NODE_ENV === 'development' ? {
                        stack: error.stack,
                        originalError: error.message
                    } : undefined,
                    timestamp,
                    correlationId
                }
            };

            res.status(statusCode).json(errorResponse);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }

    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const server = this.app.listen(this.port, this.host, () => {
                    console.log(`🚀 Fast RAG System API server running on http://${this.host}:${this.port}`);
                    console.log(`📚 API Documentation: http://${this.host}:${this.port}/api/v1`);
                    console.log(`🏥 Health Check: http://${this.host}:${this.port}/api/v1/health`);
                    resolve();
                });

                server.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`❌ Port ${this.port} is already in use`);
                    } else {
                        console.error('❌ Server error:', error);
                    }
                    reject(error);
                });

                // Graceful shutdown
                const gracefulShutdown = (signal: string) => {
                    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
                    server.close(() => {
                        console.log('✅ Server closed successfully');
                        process.exit(0);
                    });
                };

                process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
                process.on('SIGINT', () => gracefulShutdown('SIGINT'));

            } catch (error) {
                reject(error);
            }
        });
    }

    public getApp(): Application {
        return this.app;
    }
}

// Export singleton instance
export const apiGateway = new ApiGateway(
    parseInt(process.env.PORT || '3000'),
    process.env.HOST || '0.0.0.0'
);