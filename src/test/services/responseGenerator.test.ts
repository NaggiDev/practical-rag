import { SearchResult } from '../../models/response';
import { ResponseContext, ResponseGenerator, ResponseGeneratorConfig } from '../../services/responseGenerator';

describe('ResponseGenerator', () => {
    let responseGenerator: ResponseGenerator;

    const defaultConfig: ResponseGeneratorConfig = {
        maxResponseLength: 2000,
        minSourcesForSynthesis: 2,
        confidenceThreshold: 0.3,
        citationStyle: 'inline',
        enableCoherenceCheck: true,
        maxSourcesInResponse: 5
    };

    const mockSearchResults: SearchResult[] = [
        {
            contentId: 'content1',
            sourceId: 'source1',
            title: 'Machine Learning Basics',
            excerpt: 'Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed.',
            relevanceScore: 0.9,
            embedding: new Array(384).fill(0.1),
            metadata: {
                sourceName: 'AI Textbook',
                url: 'https://example.com/ml-basics'
            }
        },
        {
            contentId: 'content2',
            sourceId: 'source2',
            title: 'Deep Learning Overview',
            excerpt: 'Deep learning uses neural networks with multiple layers to model and understand complex patterns in data, making it particularly effective for image and speech recognition.',
            relevanceScore: 0.8,
            embedding: new Array(384).fill(0.2),
            metadata: {
                sourceName: 'Deep Learning Guide',
                url: 'https://example.com/deep-learning'
            }
        },
        {
            contentId: 'content3',
            sourceId: 'source3',
            title: 'AI Applications',
            excerpt: 'Artificial intelligence applications span across various industries including healthcare, finance, transportation, and entertainment.',
            relevanceScore: 0.7,
            embedding: new Array(384).fill(0.3),
            metadata: {
                sourceName: 'AI Applications Journal'
            }
        }
    ];

    const mockContext: ResponseContext = {
        queryText: 'What is machine learning?',
        queryIntent: 'question'
    };

    beforeEach(() => {
        responseGenerator = new ResponseGenerator(defaultConfig);
    });

    describe('constructor', () => {
        it('should initialize with default config when no config provided', () => {
            const generator = new ResponseGenerator();
            const config = generator.getConfig();

            expect(config.maxResponseLength).toBe(2000);
            expect(config.minSourcesForSynthesis).toBe(2);
            expect(config.confidenceThreshold).toBe(0.3);
            expect(config.citationStyle).toBe('inline');
            expect(config.enableCoherenceCheck).toBe(true);
            expect(config.maxSourcesInResponse).toBe(5);
        });

        it('should merge provided config with defaults', () => {
            const customConfig = {
                maxResponseLength: 1500,
                citationStyle: 'numbered' as const
            };

            const generator = new ResponseGenerator(customConfig);
            const config = generator.getConfig();

            expect(config.maxResponseLength).toBe(1500);
            expect(config.citationStyle).toBe('numbered');
            expect(config.minSourcesForSynthesis).toBe(2); // default
        });
    });

    describe('generateResponse', () => {
        it('should generate response with multiple sources', async () => {
            const result = await responseGenerator.generateResponse(mockSearchResults, mockContext);

            expect(result).toBeDefined();
            expect(result.synthesizedText).toBeTruthy();
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.sources).toHaveLength(3);
            expect(result.coherenceScore).toBeGreaterThanOrEqual(0);
            expect(result.processingSteps).toContain('Filtering and ranking search results');
        });

        it('should handle single source response', async () => {
            const singleResult = [mockSearchResults[0]!];
            const result = await responseGenerator.generateResponse(singleResult, mockContext);

            expect(result.synthesizedText).toContain('Based on the available information');
            expect(result.sources).toHaveLength(1);
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('should handle empty search results', async () => {
            const result = await responseGenerator.generateResponse([], mockContext);

            expect(result.synthesizedText).toContain("couldn't find any relevant information");
            expect(result.confidence).toBe(0);
            expect(result.sources).toHaveLength(0);
            expect(result.coherenceScore).toBe(0);
        });

        it('should filter results below confidence threshold', async () => {
            const lowConfidenceResults = mockSearchResults.map(result => ({
                ...result,
                relevanceScore: 0.1 // Below default threshold of 0.3
            }));

            const result = await responseGenerator.generateResponse(lowConfidenceResults, mockContext);

            expect(result.synthesizedText).toContain("couldn't find any relevant information");
            expect(result.confidence).toBe(0);
        });

        it('should limit sources to maxSourcesInResponse', async () => {
            const manyResults = Array.from({ length: 10 }, (_, i) => ({
                ...mockSearchResults[0]!,
                contentId: `content${i}`,
                sourceId: `source${i}`,
                relevanceScore: 0.9 - (i * 0.05)
            }));

            const result = await responseGenerator.generateResponse(manyResults, mockContext);

            expect(result.sources.length).toBeLessThanOrEqual(defaultConfig.maxSourcesInResponse);
        });

        it('should handle errors gracefully', async () => {
            // Mock an error in the synthesis process
            const originalSynthesize = responseGenerator.synthesizeInformation;
            responseGenerator.synthesizeInformation = jest.fn().mockRejectedValue(new Error('Synthesis error'));

            const result = await responseGenerator.generateResponse(mockSearchResults, mockContext);

            expect(result.synthesizedText).toContain('encountered an error');
            expect(result.confidence).toBe(0);
            expect(result.processingSteps).toContain('Error: Synthesis error');

            // Restore original method
            responseGenerator.synthesizeInformation = originalSynthesize;
        });
    });

    describe('synthesizeInformation', () => {
        it('should handle empty information array', async () => {
            const result = await responseGenerator.synthesizeInformation([], mockContext);
            expect(result).toContain("couldn't find any relevant information");
        });

        it('should format single source response correctly', async () => {
            const extractedInfo = [{
                content: mockSearchResults[0]!.excerpt,
                source: mockSearchResults[0]!,
                keyPoints: ['Machine learning is AI subset', 'Learns from data'],
                relevanceScore: 0.9
            }];

            const result = await responseGenerator.synthesizeInformation(extractedInfo, mockContext);
            expect(result).toContain('Based on the available information');
        });

        it('should synthesize multiple sources', async () => {
            const extractedInfo = mockSearchResults.map(result => ({
                content: result.excerpt,
                source: result,
                keyPoints: [result.excerpt.split('.')[0]!],
                relevanceScore: result.relevanceScore
            }));

            const result = await responseGenerator.synthesizeInformation(extractedInfo, mockContext);
            expect(result).toBeTruthy();
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('citation styles', () => {
        it('should add inline citations', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, citationStyle: 'inline' });
            const result = await generator.generateResponse(mockSearchResults, mockContext);

            expect(result.synthesizedText).toMatch(/\[\d+\]/);
        });

        it('should add numbered citations', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, citationStyle: 'numbered' });
            const result = await generator.generateResponse(mockSearchResults, mockContext);

            expect(result.synthesizedText).toContain('Sources:');
            expect(result.synthesizedText).toMatch(/\[\d+\]/);
        });

        it('should add footnote citations', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, citationStyle: 'footnote' });
            const result = await generator.generateResponse(mockSearchResults, mockContext);

            expect(result.synthesizedText).toContain('---');
            expect(result.synthesizedText).toMatch(/\d+\./);
        });
    });

    describe('confidence calculation', () => {
        it('should calculate higher confidence for high-relevance results', async () => {
            const highRelevanceResults = mockSearchResults.map(result => ({
                ...result,
                relevanceScore: 0.95
            }));

            const result = await responseGenerator.generateResponse(highRelevanceResults, mockContext);
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        it('should calculate lower confidence for low-relevance results', async () => {
            const lowRelevanceResults = mockSearchResults.map(result => ({
                ...result,
                relevanceScore: 0.4
            }));

            const result = await responseGenerator.generateResponse(lowRelevanceResults, mockContext);
            expect(result.confidence).toBeLessThan(0.6);
        });

        it('should factor in number of sources', async () => {
            const singleSourceResult = await responseGenerator.generateResponse([mockSearchResults[0]!], mockContext);
            const multiSourceResult = await responseGenerator.generateResponse(mockSearchResults, mockContext);

            expect(multiSourceResult.confidence).toBeGreaterThan(singleSourceResult.confidence);
        });
    });

    describe('coherence scoring', () => {
        it('should calculate coherence score when enabled', async () => {
            const result = await responseGenerator.generateResponse(mockSearchResults, mockContext);
            expect(result.coherenceScore).toBeGreaterThanOrEqual(0);
            expect(result.coherenceScore).toBeLessThanOrEqual(1);
        });

        it('should skip coherence calculation when disabled', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, enableCoherenceCheck: false });
            const result = await generator.generateResponse(mockSearchResults, mockContext);
            expect(result.coherenceScore).toBe(1.0);
        });
    });

    describe('response length management', () => {
        it('should truncate long responses', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, maxResponseLength: 100 });
            const result = await generator.generateResponse(mockSearchResults, mockContext);

            expect(result.synthesizedText.length).toBeLessThanOrEqual(120); // Allow some margin for citations
        });

        it('should preserve sentence boundaries when truncating', async () => {
            const generator = new ResponseGenerator({ ...defaultConfig, maxResponseLength: 150 });
            const result = await generator.generateResponse(mockSearchResults, mockContext);

            // Should end with proper punctuation or ellipsis
            expect(result.synthesizedText).toMatch(/[.!?]$|\.\.\.$/);
        });
    });

    describe('deduplication', () => {
        it('should deduplicate similar content', async () => {
            const duplicateResults = [
                mockSearchResults[0]!,
                { ...mockSearchResults[0]!, contentId: 'duplicate1' },
                mockSearchResults[1]!
            ];

            const result = await responseGenerator.generateResponse(duplicateResults, mockContext);

            // Should have fewer sources than input due to deduplication
            expect(result.sources.length).toBeLessThan(duplicateResults.length);
        });
    });

    describe('configuration management', () => {
        it('should return current configuration', () => {
            const config = responseGenerator.getConfig();
            expect(config).toEqual(defaultConfig);
        });

        it('should update configuration', () => {
            const newConfig = { maxResponseLength: 1000 };
            responseGenerator.updateConfig(newConfig);

            const config = responseGenerator.getConfig();
            expect(config.maxResponseLength).toBe(1000);
            expect(config.minSourcesForSynthesis).toBe(defaultConfig.minSourcesForSynthesis); // unchanged
        });
    });

    describe('health check', () => {
        it('should return healthy status when functioning correctly', async () => {
            const health = await responseGenerator.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.details).toHaveProperty('config');
            expect(health.details).toHaveProperty('testResponseGenerated');
        });

        it('should return unhealthy status when errors occur', async () => {
            // Mock an error in generateResponse
            const originalGenerate = responseGenerator.generateResponse;
            responseGenerator.generateResponse = jest.fn().mockRejectedValue(new Error('Test error'));

            const health = await responseGenerator.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toHaveProperty('error');

            // Restore original method
            responseGenerator.generateResponse = originalGenerate;
        });
    });

    describe('edge cases', () => {
        it('should handle results with missing metadata', async () => {
            const resultsWithMissingMetadata = mockSearchResults.map(result => ({
                ...result,
                metadata: {}
            }));

            const result = await responseGenerator.generateResponse(resultsWithMissingMetadata, mockContext);

            expect(result.synthesizedText).toBeTruthy();
            expect(result.sources).toHaveLength(3);
            expect(result.sources[0]?.sourceName).toBe('Unknown Source');
        });

        it('should handle empty excerpts', async () => {
            const resultsWithEmptyExcerpts = mockSearchResults.map(result => ({
                ...result,
                excerpt: ''
            }));

            const result = await responseGenerator.generateResponse(resultsWithEmptyExcerpts, mockContext);

            expect(result.synthesizedText).toContain("couldn't find any relevant information");
        });

        it('should handle very short excerpts', async () => {
            const resultsWithShortExcerpts = mockSearchResults.map(result => ({
                ...result,
                excerpt: 'Short.'
            }));

            const result = await responseGenerator.generateResponse(resultsWithShortExcerpts, mockContext);

            expect(result.synthesizedText).toBeTruthy();
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('should handle context without query intent', async () => {
            const contextWithoutIntent = { queryText: 'test query' };
            const result = await responseGenerator.generateResponse(mockSearchResults, contextWithoutIntent);

            expect(result.synthesizedText).toBeTruthy();
            expect(result.confidence).toBeGreaterThan(0);
        });
    });

    describe('source reference generation', () => {
        it('should generate proper source references', async () => {
            const result = await responseGenerator.generateResponse(mockSearchResults, mockContext);

            expect(result.sources).toHaveLength(3);
            expect(result.sources[0]).toMatchObject({
                sourceId: 'source1',
                sourceName: 'AI Textbook',
                contentId: 'content1',
                title: 'Machine Learning Basics',
                relevanceScore: 0.9,
                url: 'https://example.com/ml-basics'
            });
        });

        it('should handle sources without URLs', async () => {
            const result = await responseGenerator.generateResponse(mockSearchResults, mockContext);

            const sourceWithoutUrl = result.sources.find(s => s.sourceId === 'source3');
            expect(sourceWithoutUrl?.url).toBeUndefined();
        });
    });
});