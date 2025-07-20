import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Content } from '../../models/content';
import { ApiDataSourceConfig, DataSource } from '../../models/dataSource';
import { ConnectionError, DataSourceError, TimeoutError } from '../../utils/errors';
import { DataSourceConnector, SyncResult } from './base';

interface RateLimitConfig {
    requestsPerSecond: number;
    burstLimit: number;
}

interface PaginationState {
    hasMore: boolean;
    nextCursor?: string;
    nextOffset?: number;
    nextPage?: number;
}

/**
 * API data source connector for REST endpoint integration
 * Supports authentication, rate limiting, pagination, and response parsing
 */
export class APIConnector extends DataSourceConnector {
    private axiosInstance: AxiosInstance;
    private apiConfig: ApiDataSourceConfig;
    private rateLimiter: RateLimiter;


    constructor(dataSource: DataSource) {
        super(dataSource);
        this.apiConfig = dataSource.config as ApiDataSourceConfig;
        this.validateConfig();

        // Initialize axios instance with base configuration
        this.axiosInstance = axios.create({
            baseURL: this.apiConfig.apiEndpoint,
            timeout: this.config.timeout || 30000,
            headers: {
                'User-Agent': 'FastRAG-System/1.0',
                'Accept': 'application/json',
                ...this.apiConfig.headers
            }
        });

        // Initialize rate limiter
        const rateLimitConfig: RateLimitConfig = {
            requestsPerSecond: 10, // Default rate limit
            burstLimit: 20
        };
        this.rateLimiter = new RateLimiter(rateLimitConfig);

        // Setup request/response interceptors
        this.setupInterceptors();
    }

    /**
     * Establish connection to the API endpoint
     */
    public async connect(): Promise<void> {
        try {
            this.logOperation('info', 'Connecting to API endpoint');

            // Test connection with a simple request
            const isValid = await this.validateConnection();
            if (!isValid) {
                throw new ConnectionError('Failed to validate API connection', this.dataSource.id);
            }

            this.isConnected = true;
            this.logOperation('info', 'Successfully connected to API endpoint');
        } catch (error) {
            this.isConnected = false;
            this.handleError(error, 'connect');
        }
    }

    /**
     * Close connection to the API endpoint
     */
    public async disconnect(): Promise<void> {
        try {
            this.logOperation('info', 'Disconnecting from API endpoint');
            this.isConnected = false;
            this.logOperation('info', 'Successfully disconnected from API endpoint');
        } catch (error) {
            this.handleError(error, 'disconnect');
        }
    }

    /**
     * Validate the API connection by making a test request
     */
    public async validateConnection(): Promise<boolean> {
        try {
            // Make a test request to validate the connection
            const response = await this.makeRequest({
                method: this.apiConfig.method || 'GET',
                url: this.apiConfig.apiEndpoint,
                params: { ...this.apiConfig.queryParams, limit: 1 } // Minimal request
            });

            return response.status >= 200 && response.status < 300;
        } catch (error) {
            this.logOperation('error', 'Connection validation failed', { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }

    /**
     * Sync data from the API endpoint
     */
    public async sync(incremental: boolean = true): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
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
            result.documentsAdded = content.length; // For simplicity, treating all as new
            result.success = true;

            this.logOperation('info', 'API sync completed successfully', {
                documentsProcessed: result.documentsProcessed,
                duration: Date.now() - startTime
            });

        } catch (error) {
            result.success = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(errorMessage);

            this.logOperation('error', 'API sync failed', { error: errorMessage });
        } finally {
            result.duration = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Get content from the API endpoint with pagination support
     */
    public async getContent(lastSync?: Date): Promise<Content[]> {
        const allContent: Content[] = [];
        let paginationState: PaginationState = { hasMore: true };
        let requestCount = 0;
        const maxRequests = 100; // Prevent infinite loops

        try {
            while (paginationState.hasMore && requestCount < maxRequests) {
                // Apply rate limiting
                await this.rateLimiter.waitForSlot();

                const requestConfig = this.buildRequestConfig(paginationState, lastSync);
                const response = await this.makeRequest(requestConfig);

                // Parse response and extract content
                const { content, pagination } = this.parseResponse(response);
                allContent.push(...content);

                // Update pagination state
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

        } catch (error) {
            this.handleError(error, 'getContent');
        }
    }

    /**
     * Build request configuration for API calls
     */
    private buildRequestConfig(paginationState: PaginationState, lastSync?: Date): AxiosRequestConfig {
        const config: AxiosRequestConfig = {
            method: this.apiConfig.method || 'GET',
            url: this.apiConfig.apiEndpoint,
            params: { ...this.apiConfig.queryParams }
        };

        // Add pagination parameters
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

        // Add incremental sync parameters
        if (lastSync) {
            config.params.since = lastSync.toISOString();
        }

        return config;
    }

    /**
     * Make HTTP request with authentication and error handling
     */
    private async makeRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
        try {
            // Add authentication headers
            this.addAuthenticationHeaders(config);

            const response = await this.axiosInstance.request(config);
            return response;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    throw new TimeoutError(`Request timeout: ${error.message}`, this.dataSource.id);
                } else if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new DataSourceError(
                        `Authentication failed: ${error.response.statusText}`,
                        'AUTH_ERROR',
                        this.dataSource.id,
                        false
                    );
                } else if (error.response?.status === 429) {
                    throw new DataSourceError(
                        'Rate limit exceeded',
                        'RATE_LIMIT_EXCEEDED',
                        this.dataSource.id,
                        true
                    );
                } else if (error.response?.status && error.response.status >= 500) {
                    throw new DataSourceError(
                        `Server error: ${error.response.statusText}`,
                        'SERVER_ERROR',
                        this.dataSource.id,
                        true
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Add authentication headers to request configuration
     */
    private addAuthenticationHeaders(config: AxiosRequestConfig): void {
        if (!config.headers) {
            config.headers = {};
        }

        const { credentials } = this.apiConfig;
        if (!credentials) return;

        if (credentials.apiKey) {
            config.headers['X-API-Key'] = credentials.apiKey;
        } else if (credentials.token) {
            config.headers['Authorization'] = `Bearer ${credentials.token}`;
        } else if (credentials.username && credentials.password) {
            const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            config.headers['Authorization'] = `Basic ${auth}`;
        }
    }

    /**
     * Parse API response and extract content with pagination info
     */
    private parseResponse(response: AxiosResponse): { content: Content[]; pagination: PaginationState } {
        const data = response.data;
        const content: Content[] = [];
        let pagination: PaginationState = { hasMore: false };

        try {
            // Handle different response formats
            let items: any[] = [];

            if (Array.isArray(data)) {
                items = data;
            } else if (data.data && Array.isArray(data.data)) {
                items = data.data;
            } else if (data.items && Array.isArray(data.items)) {
                items = data.items;
            } else if (data.results && Array.isArray(data.results)) {
                items = data.results;
            } else {
                // Single item response
                items = [data];
            }

            // Convert items to Content objects
            for (const item of items) {
                const contentItem = this.transformItemToContent(item);
                if (contentItem) {
                    content.push(contentItem);
                }
            }

            // Extract pagination information
            pagination = this.extractPaginationInfo(data, content.length);

        } catch (error) {
            this.logOperation('error', 'Failed to parse API response', { error: error instanceof Error ? error.message : String(error) });
            throw new DataSourceError(
                `Failed to parse API response: ${error instanceof Error ? error.message : String(error)}`,
                'PARSE_ERROR',
                this.dataSource.id,
                false
            );
        }

        return { content, pagination };
    }

    /**
     * Transform API response item to Content object
     */
    private transformItemToContent(item: any): Content | null {
        try {
            // Extract text content from various possible fields
            let text = '';
            let title = '';

            // Common text fields
            const textFields = ['content', 'text', 'body', 'description', 'message'];
            for (const field of textFields) {
                if (item[field] && typeof item[field] === 'string') {
                    text = item[field];
                    break;
                }
            }

            // Common title fields
            const titleFields = ['title', 'name', 'subject', 'headline'];
            for (const field of titleFields) {
                if (item[field] && typeof item[field] === 'string') {
                    title = item[field];
                    break;
                }
            }

            // Skip items without text content
            if (!text && !title) {
                return null;
            }

            // Use title as text if no text content found
            if (!text && title) {
                text = title;
            }

            // Generate ID from item or create one
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
                embedding: [], // Will be populated by embedding service
                chunks: [], // Will be populated by indexing service
                lastUpdated: new Date(),
                version: 1
            };

        } catch (error) {
            this.logOperation('warn', 'Failed to transform item to content', {
                error: error instanceof Error ? error.message : String(error),
                item: JSON.stringify(item).substring(0, 200)
            });
            return null;
        }
    }

    /**
     * Extract pagination information from API response
     */
    private extractPaginationInfo(data: any, itemCount: number): PaginationState {
        const pagination: PaginationState = { hasMore: false };

        if (!this.apiConfig.pagination) {
            // No pagination configured, assume no more data if we got less than batch size
            const batchSize = this.config.batchSize || 100;
            pagination.hasMore = itemCount >= batchSize;
            return pagination;
        }

        const { type } = this.apiConfig.pagination;

        try {
            switch (type) {
                case 'offset':
                    // Look for total count or next offset
                    if (data.total && data.offset !== undefined) {
                        const currentOffset = data.offset || 0;
                        const limit = data.limit || itemCount;
                        pagination.hasMore = currentOffset + limit < data.total;
                        pagination.nextOffset = currentOffset + limit;
                    } else {
                        // Fallback: assume more data if we got a full batch
                        const batchSize = this.config.batchSize || 100;
                        pagination.hasMore = itemCount >= batchSize;
                        pagination.nextOffset = (data.offset || 0) + itemCount;
                    }
                    break;

                case 'cursor':
                    // Look for next cursor
                    pagination.nextCursor = data.next_cursor || data.nextCursor || data.cursor;
                    pagination.hasMore = !!pagination.nextCursor;
                    break;

                case 'page':
                    // Look for page information
                    if (data.page !== undefined && data.total_pages !== undefined) {
                        pagination.hasMore = data.page < data.total_pages;
                        pagination.nextPage = data.page + 1;
                    } else {
                        // Fallback: assume more data if we got a full batch
                        const batchSize = this.config.batchSize || 100;
                        pagination.hasMore = itemCount >= batchSize;
                        pagination.nextPage = (data.page || 1) + 1;
                    }
                    break;
            }
        } catch (error) {
            this.logOperation('warn', 'Failed to extract pagination info', { error: error instanceof Error ? error.message : String(error) });
            // Fallback: assume no more data
            pagination.hasMore = false;
        }

        return pagination;
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    private setupInterceptors(): void {
        // Request interceptor
        this.axiosInstance.interceptors.request.use(
            (config) => {
                this.logOperation('debug', 'Making API request', {
                    method: config.method?.toUpperCase(),
                    url: config.url,
                    params: config.params
                });
                return config;
            },
            (error) => {
                this.logOperation('error', 'Request interceptor error', { error: error.message });
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.axiosInstance.interceptors.response.use(
            (response) => {
                this.logOperation('debug', 'Received API response', {
                    status: response.status,
                    statusText: response.statusText,
                    dataSize: JSON.stringify(response.data).length
                });
                return response;
            },
            (error) => {
                this.logOperation('error', 'Response interceptor error', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    message: error.message
                });
                return Promise.reject(error);
            }
        );
    }

    /**
     * Validate API-specific configuration
     */
    protected override validateConfig(): void {
        super.validateConfig();

        const apiConfig = this.config as ApiDataSourceConfig;

        if (!apiConfig.apiEndpoint) {
            throw new DataSourceError(
                'API endpoint is required for API data source',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        // Validate URL format
        try {
            new URL(apiConfig.apiEndpoint);
        } catch {
            throw new DataSourceError(
                'Invalid API endpoint URL format',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        // Validate authentication
        if (!apiConfig.credentials ||
            (!apiConfig.credentials.apiKey && !apiConfig.credentials.token &&
                !(apiConfig.credentials.username && apiConfig.credentials.password))) {
            throw new DataSourceError(
                'API credentials are required (apiKey, token, or username/password)',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }
    }
}

/**
 * Simple rate limiter implementation
 */
class RateLimiter {
    private requests: number[] = [];
    private config: RateLimitConfig;

    constructor(config: RateLimitConfig) {
        this.config = config;
    }

    async waitForSlot(): Promise<void> {
        const now = Date.now();
        const oneSecondAgo = now - 1000;

        // Remove requests older than 1 second
        this.requests = this.requests.filter(time => time > oneSecondAgo);

        // Check if we can make a request
        if (this.requests.length >= this.config.requestsPerSecond) {
            // Calculate wait time
            const oldestRequest = Math.min(...this.requests);
            const waitTime = oldestRequest + 1000 - now;

            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.waitForSlot(); // Recursive call after waiting
            }
        }

        // Record this request
        this.requests.push(now);
    }
}
