"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIConnector = void 0;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("../../utils/errors");
const base_1 = require("./base");
class APIConnector extends base_1.DataSourceConnector {
    constructor(dataSource) {
        super(dataSource);
        this.apiConfig = dataSource.config;
        this.validateConfig();
        this.axiosInstance = axios_1.default.create({
            baseURL: this.apiConfig.apiEndpoint,
            timeout: this.config.timeout || 30000,
            headers: {
                'User-Agent': 'FastRAG-System/1.0',
                'Accept': 'application/json',
                ...this.apiConfig.headers
            }
        });
        const rateLimitConfig = {
            requestsPerSecond: 10,
            burstLimit: 20
        };
        this.rateLimiter = new RateLimiter(rateLimitConfig);
        this.setupInterceptors();
    }
    async connect() {
        try {
            this.logOperation('info', 'Connecting to API endpoint');
            const isValid = await this.validateConnection();
            if (!isValid) {
                throw new errors_1.ConnectionError('Failed to validate API connection', this.dataSource.id);
            }
            this.isConnected = true;
            this.logOperation('info', 'Successfully connected to API endpoint');
        }
        catch (error) {
            this.isConnected = false;
            this.handleError(error, 'connect');
        }
    }
    async disconnect() {
        try {
            this.logOperation('info', 'Disconnecting from API endpoint');
            this.isConnected = false;
            this.logOperation('info', 'Successfully disconnected from API endpoint');
        }
        catch (error) {
            this.handleError(error, 'disconnect');
        }
    }
    async validateConnection() {
        try {
            const response = await this.makeRequest({
                method: this.apiConfig.method || 'GET',
                url: this.apiConfig.apiEndpoint,
                params: { ...this.apiConfig.queryParams, limit: 1 }
            });
            return response.status >= 200 && response.status < 300;
        }
        catch (error) {
            this.logOperation('error', 'Connection validation failed', { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }
    async sync(incremental = true) {
        const startTime = Date.now();
        const result = {
            success: false,
            documentsProcessed: 0,
            documentsAdded: 0,
            documentsUpdated: 0,
            documentsDeleted: 0,
            errors: [],
            duration: 0
        };
        try {
            this.logOperation('info', 'Starting API sync', { incremental });
            if (!this.isConnected) {
                await this.connect();
            }
            const content = await this.getContent(incremental ? this.dataSource.lastSync : undefined);
            result.documentsProcessed = content.length;
            result.documentsAdded = content.length;
            result.success = true;
            this.logOperation('info', 'API sync completed successfully', {
                documentsProcessed: result.documentsProcessed,
                duration: Date.now() - startTime
            });
        }
        catch (error) {
            result.success = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(errorMessage);
            this.logOperation('error', 'API sync failed', { error: errorMessage });
        }
        finally {
            result.duration = Date.now() - startTime;
        }
        return result;
    }
    async getContent(lastSync) {
        const allContent = [];
        let paginationState = { hasMore: true };
        let requestCount = 0;
        const maxRequests = 100;
        try {
            while (paginationState.hasMore && requestCount < maxRequests) {
                await this.rateLimiter.waitForSlot();
                const requestConfig = this.buildRequestConfig(paginationState, lastSync);
                const response = await this.makeRequest(requestConfig);
                const { content, pagination } = this.parseResponse(response);
                allContent.push(...content);
                paginationState = pagination;
                requestCount++;
                this.logOperation('debug', 'Fetched page of content', {
                    pageSize: content.length,
                    totalFetched: allContent.length,
                    hasMore: paginationState.hasMore
                });
            }
            if (requestCount >= maxRequests) {
                this.logOperation('warn', 'Reached maximum request limit during content fetch', { maxRequests });
            }
            return allContent;
        }
        catch (error) {
            this.handleError(error, 'getContent');
        }
    }
    buildRequestConfig(paginationState, lastSync) {
        const config = {
            method: this.apiConfig.method || 'GET',
            url: this.apiConfig.apiEndpoint,
            params: { ...this.apiConfig.queryParams }
        };
        if (this.apiConfig.pagination) {
            const { pagination } = this.apiConfig;
            const batchSize = this.config.batchSize || 100;
            switch (pagination.type) {
                case 'offset':
                    config.params[pagination.limitParam || 'limit'] = batchSize;
                    if (paginationState.nextOffset !== undefined) {
                        config.params[pagination.offsetParam || 'offset'] = paginationState.nextOffset;
                    }
                    break;
                case 'cursor':
                    config.params[pagination.limitParam || 'limit'] = batchSize;
                    if (paginationState.nextCursor) {
                        config.params[pagination.cursorParam || 'cursor'] = paginationState.nextCursor;
                    }
                    break;
                case 'page':
                    config.params[pagination.limitParam || 'limit'] = batchSize;
                    if (paginationState.nextPage !== undefined) {
                        config.params[pagination.pageParam || 'page'] = paginationState.nextPage;
                    }
                    break;
            }
        }
        if (lastSync) {
            config.params.since = lastSync.toISOString();
        }
        return config;
    }
    async makeRequest(config) {
        try {
            this.addAuthenticationHeaders(config);
            const response = await this.axiosInstance.request(config);
            return response;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    throw new errors_1.TimeoutError(`Request timeout: ${error.message}`, this.dataSource.id);
                }
                else if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new errors_1.DataSourceError(`Authentication failed: ${error.response.statusText}`, 'AUTH_ERROR', this.dataSource.id, false);
                }
                else if (error.response?.status === 429) {
                    throw new errors_1.DataSourceError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', this.dataSource.id, true);
                }
                else if (error.response?.status && error.response.status >= 500) {
                    throw new errors_1.DataSourceError(`Server error: ${error.response.statusText}`, 'SERVER_ERROR', this.dataSource.id, true);
                }
            }
            throw error;
        }
    }
    addAuthenticationHeaders(config) {
        if (!config.headers) {
            config.headers = {};
        }
        const { credentials } = this.apiConfig;
        if (!credentials)
            return;
        if (credentials.apiKey) {
            config.headers['X-API-Key'] = credentials.apiKey;
        }
        else if (credentials.token) {
            config.headers['Authorization'] = `Bearer ${credentials.token}`;
        }
        else if (credentials.username && credentials.password) {
            const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            config.headers['Authorization'] = `Basic ${auth}`;
        }
    }
    parseResponse(response) {
        const data = response.data;
        const content = [];
        let pagination = { hasMore: false };
        try {
            let items = [];
            if (Array.isArray(data)) {
                items = data;
            }
            else if (data.data && Array.isArray(data.data)) {
                items = data.data;
            }
            else if (data.items && Array.isArray(data.items)) {
                items = data.items;
            }
            else if (data.results && Array.isArray(data.results)) {
                items = data.results;
            }
            else {
                items = [data];
            }
            for (const item of items) {
                const contentItem = this.transformItemToContent(item);
                if (contentItem) {
                    content.push(contentItem);
                }
            }
            pagination = this.extractPaginationInfo(data, content.length);
        }
        catch (error) {
            this.logOperation('error', 'Failed to parse API response', { error: error instanceof Error ? error.message : String(error) });
            throw new errors_1.DataSourceError(`Failed to parse API response: ${error instanceof Error ? error.message : String(error)}`, 'PARSE_ERROR', this.dataSource.id, false);
        }
        return { content, pagination };
    }
    transformItemToContent(item) {
        try {
            let text = '';
            let title = '';
            const textFields = ['content', 'text', 'body', 'description', 'message'];
            for (const field of textFields) {
                if (item[field] && typeof item[field] === 'string') {
                    text = item[field];
                    break;
                }
            }
            const titleFields = ['title', 'name', 'subject', 'headline'];
            for (const field of titleFields) {
                if (item[field] && typeof item[field] === 'string') {
                    title = item[field];
                    break;
                }
            }
            if (!text && !title) {
                return null;
            }
            if (!text && title) {
                text = title;
            }
            const id = item.id || item._id || item.uuid || `${this.dataSource.id}-${Date.now()}-${Math.random()}`;
            return {
                id: String(id),
                sourceId: this.dataSource.id,
                title: title || text.substring(0, 100),
                text,
                metadata: {
                    ...item,
                    sourceType: 'api',
                    apiEndpoint: this.apiConfig.apiEndpoint,
                    fetchedAt: new Date().toISOString()
                },
                embedding: [],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };
        }
        catch (error) {
            this.logOperation('warn', 'Failed to transform item to content', {
                error: error instanceof Error ? error.message : String(error),
                item: JSON.stringify(item).substring(0, 200)
            });
            return null;
        }
    }
    extractPaginationInfo(data, itemCount) {
        const pagination = { hasMore: false };
        if (!this.apiConfig.pagination) {
            const batchSize = this.config.batchSize || 100;
            pagination.hasMore = itemCount >= batchSize;
            return pagination;
        }
        const { type } = this.apiConfig.pagination;
        try {
            switch (type) {
                case 'offset':
                    if (data.total && data.offset !== undefined) {
                        const currentOffset = data.offset || 0;
                        const limit = data.limit || itemCount;
                        pagination.hasMore = currentOffset + limit < data.total;
                        pagination.nextOffset = currentOffset + limit;
                    }
                    else {
                        const batchSize = this.config.batchSize || 100;
                        pagination.hasMore = itemCount >= batchSize;
                        pagination.nextOffset = (data.offset || 0) + itemCount;
                    }
                    break;
                case 'cursor':
                    pagination.nextCursor = data.next_cursor || data.nextCursor || data.cursor;
                    pagination.hasMore = !!pagination.nextCursor;
                    break;
                case 'page':
                    if (data.page !== undefined && data.total_pages !== undefined) {
                        pagination.hasMore = data.page < data.total_pages;
                        pagination.nextPage = data.page + 1;
                    }
                    else {
                        const batchSize = this.config.batchSize || 100;
                        pagination.hasMore = itemCount >= batchSize;
                        pagination.nextPage = (data.page || 1) + 1;
                    }
                    break;
            }
        }
        catch (error) {
            this.logOperation('warn', 'Failed to extract pagination info', { error: error instanceof Error ? error.message : String(error) });
            pagination.hasMore = false;
        }
        return pagination;
    }
    setupInterceptors() {
        this.axiosInstance.interceptors.request.use((config) => {
            this.logOperation('debug', 'Making API request', {
                method: config.method?.toUpperCase(),
                url: config.url,
                params: config.params
            });
            return config;
        }, (error) => {
            this.logOperation('error', 'Request interceptor error', { error: error.message });
            return Promise.reject(error);
        });
        this.axiosInstance.interceptors.response.use((response) => {
            this.logOperation('debug', 'Received API response', {
                status: response.status,
                statusText: response.statusText,
                dataSize: JSON.stringify(response.data).length
            });
            return response;
        }, (error) => {
            this.logOperation('error', 'Response interceptor error', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                message: error.message
            });
            return Promise.reject(error);
        });
    }
    validateConfig() {
        super.validateConfig();
        const apiConfig = this.config;
        if (!apiConfig.apiEndpoint) {
            throw new errors_1.DataSourceError('API endpoint is required for API data source', 'INVALID_CONFIG', this.dataSource.id);
        }
        try {
            new URL(apiConfig.apiEndpoint);
        }
        catch {
            throw new errors_1.DataSourceError('Invalid API endpoint URL format', 'INVALID_CONFIG', this.dataSource.id);
        }
        if (!apiConfig.credentials ||
            (!apiConfig.credentials.apiKey && !apiConfig.credentials.token &&
                !(apiConfig.credentials.username && apiConfig.credentials.password))) {
            throw new errors_1.DataSourceError('API credentials are required (apiKey, token, or username/password)', 'INVALID_CONFIG', this.dataSource.id);
        }
    }
}
exports.APIConnector = APIConnector;
class RateLimiter {
    constructor(config) {
        this.requests = [];
        this.config = config;
    }
    async waitForSlot() {
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        this.requests = this.requests.filter(time => time > oneSecondAgo);
        if (this.requests.length >= this.config.requestsPerSecond) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = oldestRequest + 1000 - now;
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.waitForSlot();
            }
        }
        this.requests.push(now);
    }
}
//# sourceMappingURL=api.js.map