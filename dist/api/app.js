"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiGateway = exports.ApiGateway = void 0;
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importStar(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const uuid_1 = require("uuid");
const auth_1 = require("./middleware/auth");
const rateLimit_1 = require("./middleware/rateLimit");
const validation_1 = require("./middleware/validation");
const health_1 = require("./routes/health");
const query_1 = require("./routes/query");
const sources_1 = require("./routes/sources");
class ApiGateway {
    constructor(port = 3000, host = '0.0.0.0') {
        this.app = (0, express_1.default)();
        this.port = port;
        this.host = host;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)({
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
        this.app.use((0, cors_1.default)({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
            credentials: true,
            maxAge: 86400
        }));
        this.app.use((0, compression_1.default)({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression_1.default.filter(req, res);
            },
            threshold: 1024
        }));
        this.app.use((0, express_1.json)({
            limit: '10mb',
            type: ['application/json']
        }));
        this.app.use((0, express_1.urlencoded)({
            extended: true,
            limit: '10mb'
        }));
        this.app.use((req, res, next) => {
            req.correlationId = req.headers['x-correlation-id'] || (0, uuid_1.v4)();
            req.startTime = Date.now();
            res.setHeader('X-Correlation-ID', req.correlationId);
            next();
        });
        this.app.use(rateLimit_1.rateLimitMiddleware);
        this.app.use('/api/v1/query', auth_1.authMiddleware);
        this.app.use('/api/v1/sources', auth_1.authMiddleware);
    }
    setupRoutes() {
        const apiV1 = express_1.default.Router();
        apiV1.use('/health', health_1.healthRoutes);
        apiV1.use('/query', query_1.queryRoutes);
        apiV1.use('/sources', sources_1.sourcesRoutes);
        this.app.use('/api/v1', apiV1);
        this.app.get('/', (_req, res) => {
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
        this.app.get('/api/v1', (_req, res) => {
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
        this.app.use('*', (req, res) => {
            const error = {
                error: {
                    code: 'ROUTE_NOT_FOUND',
                    message: `Route ${req.method} ${req.originalUrl} not found`,
                    timestamp: new Date(),
                    correlationId: req.correlationId || (0, uuid_1.v4)()
                }
            };
            res.status(404).json(error);
        });
    }
    setupErrorHandling() {
        this.app.use(validation_1.validationErrorHandler);
        this.app.use((error, req, res, _next) => {
            const correlationId = req.correlationId || (0, uuid_1.v4)();
            const timestamp = new Date();
            console.error(`[${timestamp.toISOString()}] [${correlationId}] Error:`, {
                message: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                body: req.body,
                query: req.query,
                params: req.params
            });
            let statusCode = 500;
            let errorCode = 'INTERNAL_SERVER_ERROR';
            let message = 'An internal server error occurred';
            if (error.name === 'ValidationError') {
                statusCode = 400;
                errorCode = 'VALIDATION_ERROR';
                message = error.message;
            }
            else if (error.name === 'UnauthorizedError') {
                statusCode = 401;
                errorCode = 'UNAUTHORIZED';
                message = error.message || 'Authentication required';
            }
            else if (error.name === 'ForbiddenError') {
                statusCode = 403;
                errorCode = 'FORBIDDEN';
                message = error.message || 'Access denied';
            }
            else if (error.name === 'NotFoundError') {
                statusCode = 404;
                errorCode = 'NOT_FOUND';
                message = error.message || 'Resource not found';
            }
            else if (error.name === 'ConflictError') {
                statusCode = 409;
                errorCode = 'CONFLICT';
                message = error.message;
            }
            else if (error.name === 'RateLimitError') {
                statusCode = 429;
                errorCode = 'RATE_LIMIT_EXCEEDED';
                message = 'Rate limit exceeded';
            }
            else if (error.status) {
                statusCode = error.status;
                errorCode = error.code || 'HTTP_ERROR';
                message = error.message;
            }
            const errorResponse = {
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
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }
    async start() {
        return new Promise((resolve, reject) => {
            try {
                const server = this.app.listen(this.port, this.host, () => {
                    console.log(`🚀 Fast RAG System API server running on http://${this.host}:${this.port}`);
                    console.log(`📚 API Documentation: http://${this.host}:${this.port}/api/v1`);
                    console.log(`🏥 Health Check: http://${this.host}:${this.port}/api/v1/health`);
                    resolve();
                });
                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`❌ Port ${this.port} is already in use`);
                    }
                    else {
                        console.error('❌ Server error:', error);
                    }
                    reject(error);
                });
                const gracefulShutdown = (signal) => {
                    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
                    server.close(() => {
                        console.log('✅ Server closed successfully');
                        process.exit(0);
                    });
                };
                process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
                process.on('SIGINT', () => gracefulShutdown('SIGINT'));
            }
            catch (error) {
                reject(error);
            }
        });
    }
    getApp() {
        return this.app;
    }
}
exports.ApiGateway = ApiGateway;
exports.apiGateway = new ApiGateway(parseInt(process.env.PORT || '3000'), process.env.HOST || '0.0.0.0');
//# sourceMappingURL=app.js.map