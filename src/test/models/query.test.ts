import { v4 as uuidv4 } from 'uuid';
import { QueryModel, QueryResultModel } from '../../models/query';

describe('QueryModel', () => {
    describe('constructor and validation', () => {
        it('should create a valid query with all fields', () => {
            const queryData = {
                id: uuidv4(),
                text: 'What is machine learning?',
                context: { domain: 'AI' },
                filters: [{ field: 'category', operator: 'eq' as const, value: 'tech' }],
                timestamp: new Date(),
                userId: 'user123'
            };

            const query = new QueryModel(queryData);

            expect(query.id).toBe(queryData.id);
            expect(query.text).toBe(queryData.text);
            expect(query.context).toEqual(queryData.context);
            expect(query.filters).toEqual(queryData.filters);
            expect(query.timestamp).toEqual(queryData.timestamp);
            expect(query.userId).toBe(queryData.userId);
        });

        it('should create a valid query with minimal required fields', () => {
            const queryData = {
                text: 'Simple query'
            };

            const query = new QueryModel(queryData);

            expect(query.id).toBeDefined();
            expect(query.text).toBe('Simple query');
            expect(query.timestamp).toBeInstanceOf(Date);
            expect(query.context).toBeUndefined();
            expect(query.filters).toBeUndefined();
            expect(query.userId).toBeUndefined();
        });

        it('should sanitize text input by trimming whitespace', () => {
            const queryData = {
                text: '  What is AI?  ',
                userId: '  user123  '
            };

            const query = new QueryModel(queryData);

            expect(query.text).toBe('What is AI?');
            expect(query.userId).toBe('user123');
        });

        it('should throw error for invalid text (empty)', () => {
            const queryData = {
                text: ''
            };

            expect(() => new QueryModel(queryData)).toThrow('Query validation failed');
        });

        it('should throw error for invalid text (too long)', () => {
            const queryData = {
                text: 'a'.repeat(10001)
            };

            expect(() => new QueryModel(queryData)).toThrow('Query validation failed');
        });

        it('should throw error for invalid filter operator', () => {
            const queryData = {
                text: 'Valid query',
                filters: [{ field: 'category', operator: 'invalid' as any, value: 'tech' }]
            };

            expect(() => new QueryModel(queryData)).toThrow('Query validation failed');
        });

        it('should throw error for invalid UUID', () => {
            const queryData = {
                id: 'invalid-uuid',
                text: 'Valid query'
            };

            expect(() => new QueryModel(queryData)).toThrow('Query validation failed');
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const queryData = {
                text: 'Test query',
                context: { test: true }
            };

            const query = new QueryModel(queryData);
            const json = query.toJSON();

            expect(json).toEqual({
                id: query.id,
                text: query.text,
                context: query.context,
                filters: query.filters,
                timestamp: query.timestamp,
                userId: query.userId
            });
        });

        it('should deserialize from JSON correctly', () => {
            const queryData = {
                id: uuidv4(),
                text: 'Test query',
                timestamp: new Date(),
                context: { test: true }
            };

            const query = QueryModel.fromJSON(queryData);

            expect(query.id).toBe(queryData.id);
            expect(query.text).toBe(queryData.text);
            expect(query.timestamp).toEqual(queryData.timestamp);
            expect(query.context).toEqual(queryData.context);
        });
    });
});

describe('QueryResultModel', () => {
    describe('constructor and validation', () => {
        it('should create a valid query result with all fields', () => {
            const resultData = {
                id: uuidv4(),
                response: 'Machine learning is a subset of AI...',
                sources: [{
                    sourceId: 'source1',
                    sourceName: 'AI Textbook',
                    contentId: 'content1',
                    title: 'Introduction to ML',
                    excerpt: 'Machine learning...',
                    relevanceScore: 0.95,
                    url: 'https://example.com/ml'
                }],
                confidence: 0.9,
                processingTime: 1500,
                cached: false
            };

            const result = new QueryResultModel(resultData);

            expect(result.id).toBe(resultData.id);
            expect(result.response).toBe(resultData.response);
            expect(result.sources).toEqual(resultData.sources);
            expect(result.confidence).toBe(resultData.confidence);
            expect(result.processingTime).toBe(resultData.processingTime);
            expect(result.cached).toBe(resultData.cached);
        });

        it('should sanitize and clamp confidence values', () => {
            const resultData = {
                response: 'Test response',
                sources: [],
                confidence: 1.5, // Should be clamped to 1
                processingTime: 1000,
                cached: false
            };

            const result = new QueryResultModel(resultData);

            expect(result.confidence).toBe(1);
        });

        it('should sanitize and clamp processing time', () => {
            const resultData = {
                response: 'Test response',
                sources: [],
                confidence: 0.8,
                processingTime: -100, // Should be clamped to 0
                cached: false
            };

            const result = new QueryResultModel(resultData);

            expect(result.processingTime).toBe(0);
        });

        it('should convert cached to boolean', () => {
            const resultData = {
                response: 'Test response',
                sources: [],
                confidence: 0.8,
                processingTime: 1000,
                cached: 'true' as any
            };

            const result = new QueryResultModel(resultData);

            expect(result.cached).toBe(true);
        });

        it('should throw error for missing required fields', () => {
            const resultData = {
                response: 'Test response'
                // Missing sources, confidence, processingTime, cached
            };

            expect(() => new QueryResultModel(resultData)).toThrow('QueryResult validation failed');
        });

        it('should throw error for invalid source reference', () => {
            const resultData = {
                response: 'Test response',
                sources: [{
                    sourceId: '',
                    sourceName: 'Test Source',
                    contentId: 'content1',
                    title: 'Test Title',
                    excerpt: 'Test excerpt',
                    relevanceScore: 0.8
                }],
                confidence: 0.8,
                processingTime: 1000,
                cached: false
            };

            expect(() => new QueryResultModel(resultData)).toThrow('QueryResult validation failed');
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const resultData = {
                response: 'Test response',
                sources: [],
                confidence: 0.8,
                processingTime: 1000,
                cached: true
            };

            const result = new QueryResultModel(resultData);
            const json = result.toJSON();

            expect(json).toEqual({
                id: result.id,
                response: result.response,
                sources: result.sources,
                confidence: result.confidence,
                processingTime: result.processingTime,
                cached: result.cached
            });
        });

        it('should deserialize from JSON correctly', () => {
            const resultData = {
                id: uuidv4(),
                response: 'Test response',
                sources: [],
                confidence: 0.8,
                processingTime: 1000,
                cached: true
            };

            const result = QueryResultModel.fromJSON(resultData);

            expect(result.id).toBe(resultData.id);
            expect(result.response).toBe(resultData.response);
            expect(result.confidence).toBe(resultData.confidence);
            expect(result.processingTime).toBe(resultData.processingTime);
            expect(result.cached).toBe(resultData.cached);
        });
    });
});