import axios from 'axios';
import { APIConnector } from '../../../data/connectors/api';
import { ApiDataSourceConfig, DataSource } from '../../../models/dataSource';
import { DataSourceError, TimeoutError } from '../../../utils/errors';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('APIConnector', () => {
    let mockDataSource: DataSource;
    let mockAxiosInstance: jest.Mocked<any>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock axios.create
        mockAxiosInstance = {
            request: jest.fn(),
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() }
            }
        };
        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        mockedAxios.isAxiosError.mockImplementation((error: any) => error.isAxiosError === true);

        // Create mock data source
        mockDataSource = {
            id: 'test-api-source',
            name: 'Test API Source',
            type: 'api',
            config: {
                apiEndpoint: 'https://api.example.com/data',
                method: 'GET',
                credentials: {
                    apiKey: 'test-api-key'
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                queryParams: {
                    format: 'json'
                },
                pagination: {
                    type: 'offset',
                    limitParam: 'limit',
                    offsetParam: 'offset'
                },
                timeout: 30000,
                batchSize: 100,
                retryAttempts: 3
            } as ApiDataSourceConfig,
            status: 'active',
            lastSync: new Date('2023-01-01'),
            documentCount: 0
        };
    });

    describe('constructor', () => {
        it('should create APIConnector with valid configuration', () => {
            const connector = new APIConnector(mockDataSource);
            expect(connector).toBeInstanceOf(APIConnector);
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://api.example.com/data',
                timeout: 30000,
                headers: {
                    'User-Agent': 'FastRAG-System/1.0',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
        });

        it('should throw error for missing API endpoint', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, apiEndpoint: '' }
            };

            expect(() => new APIConnector(invalidDataSource)).toThrow(DataSourceError);
        });

        it('should throw error for invalid URL format', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, apiEndpoint: 'invalid-url' }
            };

            expect(() => new APIConnector(invalidDataSource)).toThrow(DataSourceError);
        });

        it('should throw error for missing credentials', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, credentials: {} }
            };

            expect(() => new APIConnector(invalidDataSource)).toThrow(DataSourceError);
        });
    });

    describe('connect', () => {
        it('should successfully connect to API endpoint', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: { test: 'data' }
            });

            const connector = new APIConnector(mockDataSource);
            await connector.connect();

            expect(connector.getConnectionStatus()).toBe(true);
            expect(mockAxiosInstance.request).toHaveBeenCalled();
        });

        it('should handle connection failure', async () => {
            mockAxiosInstance.request.mockRejectedValueOnce(new Error('Connection failed'));

            const connector = new APIConnector(mockDataSource);

            await expect(connector.connect()).rejects.toThrow();
            expect(connector.getConnectionStatus()).toBe(false);
        });
    });

    describe('validateConnection', () => {
        it('should return true for successful validation', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: { test: 'data' }
            });

            const connector = new APIConnector(mockDataSource);
            const isValid = await connector.validateConnection();

            expect(isValid).toBe(true);
            expect(mockAxiosInstance.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'GET',
                    url: 'https://api.example.com/data',
                    params: { format: 'json', limit: 1 },
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key'
                    })
                })
            );
        });

        it('should return false for failed validation', async () => {
            mockAxiosInstance.request.mockRejectedValueOnce(new Error('Validation failed'));

            const connector = new APIConnector(mockDataSource);
            const isValid = await connector.validateConnection();

            expect(isValid).toBe(false);
        });
    });

    describe('authentication', () => {
        it('should add API key authentication header', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: []
            });

            const connector = new APIConnector(mockDataSource);
            await connector.getContent();

            expect(mockAxiosInstance.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key'
                    })
                })
            );
        });

        it('should add Bearer token authentication header', async () => {
            const tokenDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    credentials: { token: 'test-bearer-token' }
                }
            };

            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: []
            });

            const connector = new APIConnector(tokenDataSource);
            await connector.getContent();

            expect(mockAxiosInstance.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-bearer-token'
                    })
                })
            );
        });

        it('should add Basic authentication header', async () => {
            const basicAuthDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    credentials: { username: 'testuser', password: 'testpass' }
                }
            };

            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: []
            });

            const connector = new APIConnector(basicAuthDataSource);
            await connector.getContent();

            const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
            expect(mockAxiosInstance.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Basic ${expectedAuth}`
                    })
                })
            );
        });
    });

    describe('pagination', () => {
        it('should handle offset pagination', async () => {
            // First page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    data: [
                        { id: 1, content: 'Item 1' },
                        { id: 2, content: 'Item 2' }
                    ],
                    total: 4,
                    offset: 0,
                    limit: 2
                }
            });

            // Second page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    data: [
                        { id: 3, content: 'Item 3' },
                        { id: 4, content: 'Item 4' }
                    ],
                    total: 4,
                    offset: 2,
                    limit: 2
                }
            });

            const paginatedDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    batchSize: 2
                }
            };

            const connector = new APIConnector(paginatedDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(4);
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);

            // Check first request
            expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(1,
                expect.objectContaining({
                    params: expect.objectContaining({
                        limit: 2,
                        format: 'json'
                    })
                })
            );

            // Check second request
            expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(2,
                expect.objectContaining({
                    params: expect.objectContaining({
                        limit: 2,
                        offset: 2,
                        format: 'json'
                    })
                })
            );
        });

        it('should handle cursor pagination', async () => {
            const cursorDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    pagination: {
                        type: 'cursor' as const,
                        limitParam: 'limit',
                        cursorParam: 'cursor'
                    },
                    batchSize: 2
                }
            };

            // First page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    items: [
                        { id: 1, content: 'Item 1' },
                        { id: 2, content: 'Item 2' }
                    ],
                    next_cursor: 'cursor123'
                }
            });

            // Second page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    items: [
                        { id: 3, content: 'Item 3' }
                    ],
                    next_cursor: null
                }
            });

            const connector = new APIConnector(cursorDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(3);
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);

            // Check second request has cursor
            expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(2,
                expect.objectContaining({
                    params: expect.objectContaining({
                        cursor: 'cursor123'
                    })
                })
            );
        });

        it('should handle page-based pagination', async () => {
            const pageDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    pagination: {
                        type: 'page' as const,
                        limitParam: 'limit',
                        pageParam: 'page'
                    },
                    batchSize: 2
                }
            };

            // First page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    results: [
                        { id: 1, content: 'Item 1' },
                        { id: 2, content: 'Item 2' }
                    ],
                    page: 1,
                    total_pages: 2
                }
            });

            // Second page
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    results: [
                        { id: 3, content: 'Item 3' }
                    ],
                    page: 2,
                    total_pages: 2
                }
            });

            const connector = new APIConnector(pageDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(3);
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);

            // Check second request has page number
            expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(2,
                expect.objectContaining({
                    params: expect.objectContaining({
                        page: 2
                    })
                })
            );
        });
    });

    describe('response parsing', () => {
        it('should parse array response format', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: [
                    { id: 1, title: 'Title 1', content: 'Content 1' },
                    { id: 2, title: 'Title 2', content: 'Content 2' }
                ]
            });

            const connector = new APIConnector(mockDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(2);
            expect(content[0]).toMatchObject({
                id: '1',
                sourceId: 'test-api-source',
                title: 'Title 1',
                text: 'Content 1'
            });
        });

        it('should parse nested data response format', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: {
                    data: [
                        { id: 1, title: 'Title 1', body: 'Body 1' },
                        { id: 2, title: 'Title 2', body: 'Body 2' }
                    ]
                }
            });

            const connector = new APIConnector(mockDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(2);
            expect(content[0]).toMatchObject({
                id: '1',
                title: 'Title 1',
                text: 'Body 1'
            });
        });

        it('should handle single item response', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: { id: 1, title: 'Single Item', text: 'Single content' }
            });

            const connector = new APIConnector(mockDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(1);
            expect(content[0]).toMatchObject({
                id: '1',
                title: 'Single Item',
                text: 'Single content'
            });
        });

        it('should skip items without text content', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: [
                    { id: 1, title: 'Valid Item', content: 'Valid content' },
                    { id: 2, metadata: 'No text content' },
                    { id: 3, title: 'Another Valid Item' }
                ]
            });

            const connector = new APIConnector(mockDataSource);
            const content = await connector.getContent();

            expect(content).toHaveLength(2);
            expect(content[0]?.text).toBe('Valid content');
            expect(content[1]?.text).toBe('Another Valid Item'); // Title used as text
        });
    });

    describe('error handling', () => {
        it('should handle timeout errors', async () => {
            const timeoutError = {
                isAxiosError: true,
                code: 'ETIMEDOUT',
                message: 'Request timeout'
            };
            mockAxiosInstance.request.mockRejectedValueOnce(timeoutError);

            const connector = new APIConnector(mockDataSource);

            await expect(connector.getContent()).rejects.toThrow(TimeoutError);
        });

        it('should handle authentication errors', async () => {
            const authError = {
                isAxiosError: true,
                response: { status: 401, statusText: 'Unauthorized' },
                message: 'Authentication failed'
            };
            mockAxiosInstance.request.mockRejectedValueOnce(authError);

            const connector = new APIConnector(mockDataSource);

            await expect(connector.getContent()).rejects.toThrow(DataSourceError);
        });

        it('should handle rate limit errors', async () => {
            const rateLimitError = {
                isAxiosError: true,
                response: { status: 429, statusText: 'Too Many Requests' },
                message: 'Rate limit exceeded'
            };
            mockAxiosInstance.request.mockRejectedValueOnce(rateLimitError);

            const connector = new APIConnector(mockDataSource);

            await expect(connector.getContent()).rejects.toThrow(DataSourceError);
        });

        it('should handle server errors', async () => {
            const serverError = {
                isAxiosError: true,
                response: { status: 500, statusText: 'Internal Server Error' },
                message: 'Server error'
            };
            mockAxiosInstance.request.mockRejectedValueOnce(serverError);

            const connector = new APIConnector(mockDataSource);

            await expect(connector.getContent()).rejects.toThrow(DataSourceError);
        });
    });

    describe('rate limiting', () => {
        it('should respect rate limits', async () => {
            // Mock multiple successful responses
            for (let i = 0; i < 15; i++) {
                mockAxiosInstance.request.mockResolvedValueOnce({
                    status: 200,
                    data: [{ id: i, content: `Content ${i}` }]
                });
            }

            const connector = new APIConnector(mockDataSource);
            const startTime = Date.now();

            // Make multiple requests that should trigger rate limiting
            const promises = [];
            for (let i = 0; i < 15; i++) {
                promises.push(connector.getContent());
            }

            await Promise.all(promises);
            const endTime = Date.now();

            // Should take some time due to rate limiting
            expect(endTime - startTime).toBeGreaterThan(100);
        });
    });

    describe('sync', () => {
        it('should perform successful sync', async () => {
            // Mock validation call for connect
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: { test: 'validation' }
            });

            // Mock actual data fetch
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: [
                    { id: 1, content: 'Item 1' },
                    { id: 2, content: 'Item 2' }
                ]
            });

            const connector = new APIConnector(mockDataSource);
            const result = await connector.sync();

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(2);
            expect(result.documentsAdded).toBe(2);
            expect(result.errors).toHaveLength(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should handle sync failure', async () => {
            mockAxiosInstance.request.mockRejectedValueOnce(new Error('Sync failed'));

            const connector = new APIConnector(mockDataSource);
            const result = await connector.sync();

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should support incremental sync', async () => {
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: [{ id: 1, content: 'New item' }]
            });

            const connector = new APIConnector(mockDataSource);
            await connector.sync(true);

            expect(mockAxiosInstance.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({
                        since: mockDataSource.lastSync.toISOString()
                    })
                })
            );
        });
    });

    describe('disconnect', () => {
        it('should successfully disconnect', async () => {
            // Mock successful validation for connect
            mockAxiosInstance.request.mockResolvedValueOnce({
                status: 200,
                data: { test: 'validation' }
            });

            const connector = new APIConnector(mockDataSource);
            await connector.connect();

            expect(connector.getConnectionStatus()).toBe(true);

            await connector.disconnect();
            expect(connector.getConnectionStatus()).toBe(false);
        });
    });
});