import { v4 as uuidv4 } from 'uuid';
import { ContentChunkModel, ContentModel } from '../../models/content';

describe('ContentChunkModel', () => {
    describe('constructor and validation', () => {
        it('should create a valid content chunk with all fields', () => {
            const chunkData = {
                id: uuidv4(),
                text: 'This is a sample chunk of text content.',
                embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 38,
                    chunkSize: 38,
                    overlap: 5,
                    customField: 'custom value'
                }
            };

            const chunk = new ContentChunkModel(chunkData);

            expect(chunk.id).toBe(chunkData.id);
            expect(chunk.text).toBe(chunkData.text);
            expect(chunk.embedding).toEqual(chunkData.embedding);
            expect(chunk.position).toBe(chunkData.position);
            expect(chunk.metadata).toEqual(chunkData.metadata);
        });

        it('should create a valid content chunk with minimal required fields', () => {
            const chunkData = {
                text: 'Sample text',
                embedding: [0.1, 0.2],
                position: 1,
                metadata: {
                    startIndex: 10,
                    endIndex: 21,
                    chunkSize: 11
                }
            };

            const chunk = new ContentChunkModel(chunkData);

            expect(chunk.id).toBeDefined();
            expect(chunk.text).toBe('Sample text');
            expect(chunk.embedding).toEqual([0.1, 0.2]);
            expect(chunk.position).toBe(1);
        });

        it('should sanitize numeric values', () => {
            const chunkData = {
                text: '  Sample text  ',
                embedding: ['0.1', '0.2'] as any,
                position: -1.5,
                metadata: {
                    startIndex: -5.7,
                    endIndex: 20.9,
                    chunkSize: 0.5,
                    overlap: -2.3
                }
            };

            const chunk = new ContentChunkModel(chunkData);

            expect(chunk.text).toBe('Sample text');
            expect(chunk.embedding).toEqual([0.1, 0.2]);
            expect(chunk.position).toBe(0); // Clamped to 0
            expect(chunk.metadata.startIndex).toBe(0); // Clamped to 0
            expect(chunk.metadata.endIndex).toBe(20); // Floored
            expect(chunk.metadata.chunkSize).toBe(1); // Clamped to 1
            expect(chunk.metadata.overlap).toBe(0); // Clamped to 0
        });

        it('should throw error for invalid text (empty)', () => {
            const chunkData = {
                text: '',
                embedding: [0.1],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 0,
                    chunkSize: 1
                }
            };

            expect(() => new ContentChunkModel(chunkData)).toThrow('ContentChunk validation failed');
        });

        it('should throw error for invalid embedding (empty array)', () => {
            const chunkData = {
                text: 'Sample text',
                embedding: [],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 11,
                    chunkSize: 11
                }
            };

            expect(() => new ContentChunkModel(chunkData)).toThrow('ContentChunk validation failed');
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const chunkData = {
                text: 'Sample text',
                embedding: [0.1, 0.2],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 11,
                    chunkSize: 11
                }
            };

            const chunk = new ContentChunkModel(chunkData);
            const json = chunk.toJSON();

            expect(json).toEqual({
                id: chunk.id,
                text: chunk.text,
                embedding: chunk.embedding,
                position: chunk.position,
                metadata: chunk.metadata
            });
        });

        it('should deserialize from JSON correctly', () => {
            const chunkData = {
                id: uuidv4(),
                text: 'Sample text',
                embedding: [0.1, 0.2],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 11,
                    chunkSize: 11
                }
            };

            const chunk = ContentChunkModel.fromJSON(chunkData);

            expect(chunk.id).toBe(chunkData.id);
            expect(chunk.text).toBe(chunkData.text);
            expect(chunk.embedding).toEqual(chunkData.embedding);
            expect(chunk.position).toBe(chunkData.position);
            expect(chunk.metadata).toEqual(chunkData.metadata);
        });
    });
});

describe('ContentModel', () => {
    describe('constructor and validation', () => {
        it('should create a valid content with all fields', () => {
            const contentData = {
                id: uuidv4(),
                sourceId: 'source123',
                title: 'Sample Document',
                text: 'This is the full text content of the document.',
                metadata: {
                    fileType: 'pdf',
                    author: 'John Doe',
                    createdAt: new Date('2023-01-01'),
                    modifiedAt: new Date('2023-01-02'),
                    tags: ['ai', 'machine-learning'],
                    category: 'research',
                    customField: 'custom value'
                },
                embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
                chunks: [{
                    id: uuidv4(),
                    text: 'First chunk',
                    embedding: [0.1, 0.2],
                    position: 0,
                    metadata: {
                        startIndex: 0,
                        endIndex: 11,
                        chunkSize: 11
                    }
                }],
                lastUpdated: new Date(),
                version: 1
            };

            const content = new ContentModel(contentData);

            expect(content.id).toBe(contentData.id);
            expect(content.sourceId).toBe(contentData.sourceId);
            expect(content.title).toBe(contentData.title);
            expect(content.text).toBe(contentData.text);
            expect(content.metadata).toEqual(contentData.metadata);
            expect(content.embedding).toEqual(contentData.embedding);
            expect(content.chunks).toEqual(contentData.chunks);
            expect(content.lastUpdated).toEqual(contentData.lastUpdated);
            expect(content.version).toBe(contentData.version);
        });

        it('should create a valid content with minimal required fields', () => {
            const contentData = {
                sourceId: 'source123',
                title: 'Simple Document',
                text: 'Simple text content.',
                embedding: [0.1, 0.2, 0.3]
            };

            const content = new ContentModel(contentData);

            expect(content.id).toBeDefined();
            expect(content.sourceId).toBe('source123');
            expect(content.title).toBe('Simple Document');
            expect(content.text).toBe('Simple text content.');
            expect(content.metadata).toEqual({});
            expect(content.embedding).toEqual([0.1, 0.2, 0.3]);
            expect(content.chunks).toEqual([]);
            expect(content.lastUpdated).toBeInstanceOf(Date);
            expect(content.version).toBe(1);
        });

        it('should sanitize string fields by trimming whitespace', () => {
            const contentData = {
                sourceId: '  source123  ',
                title: '  Sample Document  ',
                text: '  Sample text content.  ',
                metadata: {
                    fileType: '  pdf  ',
                    author: '  John Doe  ',
                    tags: ['  ai  ', '  ml  '],
                    category: '  research  '
                },
                embedding: [0.1, 0.2]
            };

            const content = new ContentModel(contentData);

            expect(content.sourceId).toBe('source123');
            expect(content.title).toBe('Sample Document');
            expect(content.text).toBe('Sample text content.');
            expect(content.metadata.fileType).toBe('pdf');
            expect(content.metadata.author).toBe('John Doe');
            expect(content.metadata.tags).toEqual(['ai', 'ml']);
            expect(content.metadata.category).toBe('research');
        });

        it('should sanitize and clamp version number', () => {
            const contentData = {
                sourceId: 'source123',
                title: 'Sample Document',
                text: 'Sample text content.',
                embedding: [0.1, 0.2],
                version: -1.5
            };

            const content = new ContentModel(contentData);

            expect(content.version).toBe(1); // Clamped to minimum 1
        });

        it('should throw error for invalid title (empty)', () => {
            const contentData = {
                sourceId: 'source123',
                title: '',
                text: 'Sample text content.',
                embedding: [0.1, 0.2]
            };

            expect(() => new ContentModel(contentData)).toThrow('Content validation failed');
        });

        it('should throw error for invalid text (empty)', () => {
            const contentData = {
                sourceId: 'source123',
                title: 'Sample Document',
                text: '',
                embedding: [0.1, 0.2]
            };

            expect(() => new ContentModel(contentData)).toThrow('Content validation failed');
        });

        it('should throw error for invalid embedding (empty array)', () => {
            const contentData = {
                sourceId: 'source123',
                title: 'Sample Document',
                text: 'Sample text content.',
                embedding: []
            };

            expect(() => new ContentModel(contentData)).toThrow('Content validation failed');
        });
    });

    describe('methods', () => {
        let content: ContentModel;

        beforeEach(() => {
            content = new ContentModel({
                sourceId: 'source123',
                title: 'Test Document',
                text: 'Test content.',
                embedding: [0.1, 0.2, 0.3],
                version: 1
            });
        });

        it('should update version correctly', () => {
            const originalTime = content.lastUpdated.getTime();

            // Add a small delay to ensure timestamp difference
            const updatedContent = content.updateVersion();

            expect(updatedContent.version).toBe(2);
            expect(updatedContent.lastUpdated).toBeInstanceOf(Date);
            expect(updatedContent.lastUpdated.getTime()).toBeGreaterThanOrEqual(originalTime);
        });

        it('should add chunk correctly', () => {
            const newChunk = {
                id: uuidv4(),
                text: 'New chunk',
                embedding: [0.4, 0.5],
                position: 0,
                metadata: {
                    startIndex: 0,
                    endIndex: 9,
                    chunkSize: 9
                }
            };

            const updatedContent = content.addChunk(newChunk);

            expect(updatedContent.chunks).toHaveLength(1);
            expect(updatedContent.chunks[0]).toEqual(newChunk);
            expect(updatedContent.lastUpdated).toBeInstanceOf(Date);
            expect(updatedContent.lastUpdated.getTime()).toBeGreaterThanOrEqual(content.lastUpdated.getTime());
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const contentData = {
                sourceId: 'source123',
                title: 'Test Document',
                text: 'Test content.',
                embedding: [0.1, 0.2],
                metadata: { test: true }
            };

            const content = new ContentModel(contentData);
            const json = content.toJSON();

            expect(json).toEqual({
                id: content.id,
                sourceId: content.sourceId,
                title: content.title,
                text: content.text,
                metadata: content.metadata,
                embedding: content.embedding,
                chunks: content.chunks,
                lastUpdated: content.lastUpdated,
                version: content.version
            });
        });

        it('should deserialize from JSON correctly', () => {
            const contentData = {
                id: uuidv4(),
                sourceId: 'source123',
                title: 'Test Document',
                text: 'Test content.',
                metadata: { test: true },
                embedding: [0.1, 0.2],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };

            const content = ContentModel.fromJSON(contentData);

            expect(content.id).toBe(contentData.id);
            expect(content.sourceId).toBe(contentData.sourceId);
            expect(content.title).toBe(contentData.title);
            expect(content.text).toBe(contentData.text);
            expect(content.metadata).toEqual(contentData.metadata);
            expect(content.embedding).toEqual(contentData.embedding);
            expect(content.chunks).toEqual(contentData.chunks);
            expect(content.lastUpdated).toEqual(contentData.lastUpdated);
            expect(content.version).toBe(contentData.version);
        });
    });
});