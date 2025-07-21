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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryProcessor = exports.EmbeddingService = exports.requireRole = exports.authMiddleware = exports.apiGateway = exports.ApiGateway = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = require("./api/app");
const config_1 = require("./config");
dotenv_1.default.config();
async function main() {
    try {
        const configManager = config_1.ConfigManager.getInstance();
        const config = await configManager.loadConfig();
        console.log('Fast RAG System starting...');
        console.log(`Server will run on ${config.server.host}:${config.server.port}`);
        console.log(`Vector DB: ${config.database.vector.provider}`);
        console.log(`Embedding provider: ${config.embedding.provider}`);
        await app_1.apiGateway.start();
        console.log('✅ Fast RAG System started successfully');
    }
    catch (error) {
        console.error('Failed to start Fast RAG System:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
var app_2 = require("./api/app");
Object.defineProperty(exports, "ApiGateway", { enumerable: true, get: function () { return app_2.ApiGateway; } });
Object.defineProperty(exports, "apiGateway", { enumerable: true, get: function () { return app_2.apiGateway; } });
var auth_1 = require("./api/middleware/auth");
Object.defineProperty(exports, "authMiddleware", { enumerable: true, get: function () { return auth_1.authMiddleware; } });
Object.defineProperty(exports, "requireRole", { enumerable: true, get: function () { return auth_1.requireRole; } });
__exportStar(require("./config"), exports);
__exportStar(require("./data"), exports);
__exportStar(require("./models"), exports);
var embedding_1 = require("./services/embedding");
Object.defineProperty(exports, "EmbeddingService", { enumerable: true, get: function () { return embedding_1.EmbeddingService; } });
var queryProcessor_1 = require("./services/queryProcessor");
Object.defineProperty(exports, "QueryProcessor", { enumerable: true, get: function () { return queryProcessor_1.QueryProcessor; } });
//# sourceMappingURL=index.js.map