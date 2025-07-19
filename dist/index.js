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
const dotenv_1 = __importDefault(require("dotenv"));
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
    }
    catch (error) {
        console.error('Failed to start Fast RAG System:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
__exportStar(require("./api"), exports);
__exportStar(require("./config"), exports);
__exportStar(require("./data"), exports);
__exportStar(require("./models"), exports);
__exportStar(require("./services"), exports);
__exportStar(require("./utils"), exports);
//# sourceMappingURL=index.js.map