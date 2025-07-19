import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileWatchEvent } from '../../../data/connectors/file';
import { FileConnector } from '../../../data/connectors/file';
import { DataSource, FileDataSourceConfig } from '../../../models/dataSource';
import { ValidationError } from '../../../utils/errors';

// Mock external dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth');
jest.mock('marked');

const mockPdfParse = jest.fn();
const mockMammoth = require('mammoth') as jest.Mocked<any>;
const mockMarked = require('marked') as jest.MockedFunction<any>;

describe('FileConnector', () => {
    let mockDataSource: DataSource;
    let connector: FileConnector;
    let testDir: string;

    beforeEach(async () => {
        // Create a temporary test directory
        testDir = path.join(__dirname, '../../test-data/file-connector-test');
        await fs.mkdir(testDir, { recursive: true });

        mockDataSource = {
            id: 'test-file-source',
            name: 'Test File Source',
            type: 'file',
            config: {
                filePath: testDir,
                fileTypes: ['txt', 'md', 'pdf', 'docx'],
                watchForChanges: true,
                recursive: true,
                excludePatterns: ['*.tmp', '*.log']
            } as FileDataSourceConfig,
            status: 'active',
            lastSync: new Date(),
            documentCount: 0
        };

        connector = new FileConnector(mockDataSource);

        // Setup mocks
        mockPdfParse.mockResolvedValue({ text: 'PDF content' });
        mockMammoth.extractRawText.mockResolvedValue({ value: 'DOCX content' });
        (mockMarked as jest.MockedFunction<any>).mockReturnValue('<p>Markdown content</p>');
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with valid file configuration', () => {
            expect(connector.getDataSource().id).toBe('test-file-source');
            expect(connector.getConnectionStatus()).toBe(false);
        });

        it('should throw validation error for missing file path', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, filePath: '' } as FileDataSourceConfig
            };

            expect(() => new FileConnector(invalidDataSource)).toThrow(ValidationError);
        });

        it('should throw validation error for unsupported file types', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, fileTypes: ['txt', 'xyz'] } as FileDataSourceConfig
            };

            expect(() => new FileConnector(invalidDataSource)).toThrow(ValidationError);
        });
    });

    describe('connect', () => {
        it('should connect successfully to existing directory', async () => {
            await connector.connect();
            expect(connector.getConnectionStatus()).toBe(true);
        });

        it('should connect successfully to existing file', async () => {
            const testFile = path.join(testDir, 'test.txt');
            await fs.writeFile(testFile, 'test content');

            const fileDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, filePath: testFile } as FileDataSourceConfig
            };
            const fileConnector = new FileConnector(fileDataSource);

            await fileConnector.connect();
            expect(fileConnector.getConnectionStatus()).toBe(true);
        });

        it('should throw error for non-existent path', async () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, filePath: '/non/existent/path' } as FileDataSourceConfig
            };
            const invalidConnector = new FileConnector(invalidDataSource);

            await expect(invalidConnector.connect()).rejects.toThrow(ValidationError);
        });
    });

    describe('validateConnection', () => {
        it('should return true for valid path', async () => {
            const isValid = await connector.validateConnection();
            expect(isValid).toBe(true);
        });

        it('should return false for invalid path', async () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, filePath: '/non/existent/path' } as FileDataSourceConfig
            };
            const invalidConnector = new FileConnector(invalidDataSource);

            const isValid = await invalidConnector.validateConnection();
            expect(isValid).toBe(false);
        });
    });

    describe('file discovery', () => {
        beforeEach(async () => {
            // Create test files
            await fs.writeFile(path.join(testDir, 'test1.txt'), 'Text content 1');
            await fs.writeFile(path.join(testDir, 'test2.md'), '# Markdown content');
            await fs.writeFile(path.join(testDir, 'test3.pdf'), 'PDF binary content');
            await fs.writeFile(path.join(testDir, 'test4.docx'), 'DOCX binary content');
            await fs.writeFile(path.join(testDir, 'excluded.tmp'), 'Excluded content');
            await fs.writeFile(path.join(testDir, 'unsupported.xyz'), 'Unsupported content');

            // Create subdirectory with files
            const subDir = path.join(testDir, 'subdir');
            await fs.mkdir(subDir);
            await fs.writeFile(path.join(subDir, 'nested.txt'), 'Nested content');
        });

        it('should discover supported files in directory', async () => {
            await connector.connect();
            const content = await connector.getContent();

            expect(content.length).toBe(5); // 4 main files + 1 nested file
            expect(content.some(c => c.title === 'test1')).toBe(true);
            expect(content.some(c => c.title === 'test2')).toBe(true);
            expect(content.some(c => c.title === 'test3')).toBe(true);
            expect(content.some(c => c.title === 'test4')).toBe(true);
            expect(content.some(c => c.title === 'nested')).toBe(true);
        });

        it('should exclude files matching exclude patterns', async () => {
            await connector.connect();
            const content = await connector.getContent();

            expect(content.some(c => c.title === 'excluded')).toBe(false);
        });

        it('should filter by file types when specified', async () => {
            const filteredDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, fileTypes: ['txt'] } as FileDataSourceConfig
            };
            const filteredConnector = new FileConnector(filteredDataSource);

            await filteredConnector.connect();
            const content = await filteredConnector.getContent();

            expect(content.length).toBe(2); // test1.txt and nested.txt
            expect(content.every(c => c.metadata.fileType === 'txt')).toBe(true);
        });

        it('should not recurse when recursive is false', async () => {
            const nonRecursiveDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, recursive: false } as FileDataSourceConfig
            };
            const nonRecursiveConnector = new FileConnector(nonRecursiveDataSource);

            await nonRecursiveConnector.connect();
            const content = await nonRecursiveConnector.getContent();

            expect(content.length).toBe(4); // Only files in root directory
            expect(content.some(c => c.title === 'nested')).toBe(false);
        });
    });

    describe('file parsing', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'test.txt'), 'Plain text content');
            await fs.writeFile(path.join(testDir, 'test.md'), '# Markdown Title\n\nMarkdown content');
            await fs.writeFile(path.join(testDir, 'test.pdf'), 'PDF binary data');
            await fs.writeFile(path.join(testDir, 'test.docx'), 'DOCX binary data');
        });

        it('should parse text files correctly', async () => {
            await connector.connect();
            const content = await connector.getContent();
            const txtContent = content.find(c => c.title === 'test');

            expect(txtContent).toBeDefined();
            expect(txtContent!.text).toBe('Plain text content');
            expect(txtContent!.metadata.fileType).toBe('txt');
        });

        it('should parse markdown files correctly', async () => {
            await connector.connect();
            const content = await connector.getContent();
            const mdContent = content.find(c => c.title === 'test' && c.metadata.fileType === 'md');

            expect(mdContent).toBeDefined();
            expect(mdContent!.text).toBe('Markdown content'); // HTML tags removed
            expect(mdContent!.metadata.fileType).toBe('md');
        });

        it('should parse PDF files correctly', async () => {
            await connector.connect();
            const content = await connector.getContent();
            const pdfContent = content.find(c => c.title === 'test' && c.metadata.fileType === 'pdf');

            expect(pdfContent).toBeDefined();
            expect(pdfContent!.text).toBe('PDF content');
            expect(pdfContent!.metadata.fileType).toBe('pdf');
            expect(mockPdfParse).toHaveBeenCalled();
        });

        it('should parse DOCX files correctly', async () => {
            await connector.connect();
            const content = await connector.getContent();
            const docxContent = content.find(c => c.title === 'test' && c.metadata.fileType === 'docx');

            expect(docxContent).toBeDefined();
            expect(docxContent!.text).toBe('DOCX content');
            expect(docxContent!.metadata.fileType).toBe('docx');
            expect(mockMammoth.extractRawText).toHaveBeenCalled();
        });

        it('should handle parsing errors gracefully', async () => {
            mockPdfParse.mockRejectedValueOnce(new Error('PDF parsing failed'));

            await fs.writeFile(path.join(testDir, 'corrupt.pdf'), 'Corrupt PDF data');
            await connector.connect();

            // Should not throw, but log the error
            const content = await connector.getContent();
            const pdfContent = content.find(c => c.title === 'corrupt');
            expect(pdfContent).toBeUndefined();
        });
    });

    describe('sync', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'file1.txt'), 'Content 1');
            await fs.writeFile(path.join(testDir, 'file2.txt'), 'Content 2');
        });

        it('should sync all files successfully', async () => {
            const result = await connector.sync();

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(2);
            expect(result.documentsAdded).toBe(2);
            expect(result.errors).toHaveLength(0);
            expect(result.duration).toBeGreaterThan(0);
        });

        it('should handle incremental sync', async () => {
            // First sync
            await connector.sync();

            // Add new file
            await fs.writeFile(path.join(testDir, 'file3.txt'), 'Content 3');

            // Incremental sync should only process new file
            const result = await connector.sync(true);

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(1); // Only the new file
        });

        it('should handle sync errors gracefully', async () => {
            // Create a file that will cause parsing to fail
            await fs.writeFile(path.join(testDir, 'bad.pdf'), 'Invalid PDF');
            mockPdfParse.mockRejectedValueOnce(new Error('Parsing failed'));

            const result = await connector.sync();

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('bad.pdf');
        });
    });

    describe('getContent with lastSync filter', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'old.txt'), 'Old content');

            // Wait a bit to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            const pastDate = new Date(Date.now() - 1000);
            await fs.writeFile(path.join(testDir, 'new.txt'), 'New content');

            // Set the old file's mtime to the past
            await fs.utimes(path.join(testDir, 'old.txt'), pastDate, pastDate);
        });

        it('should only return files modified after lastSync', async () => {
            await connector.connect();

            const lastSync = new Date(Date.now() - 500); // 500ms ago
            const content = await connector.getContent(lastSync);

            expect(content.length).toBe(1);
            expect(content[0]?.title).toBe('new');
        });
    });

    describe('disconnect', () => {
        it('should disconnect successfully', async () => {
            await connector.connect();
            expect(connector.getConnectionStatus()).toBe(true);

            await connector.disconnect();
            expect(connector.getConnectionStatus()).toBe(false);
        });
    });

    describe('file system monitoring', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'watched.txt'), 'Initial content');
        });

        it('should start file watching when watchForChanges is enabled', async () => {
            await connector.connect();
            expect(connector.isFileWatchingEnabled()).toBe(true);
            expect(connector.getWatchedPaths().length).toBeGreaterThan(0);
        });

        it('should not start file watching when watchForChanges is disabled', async () => {
            const nonWatchingDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, watchForChanges: false } as FileDataSourceConfig
            };
            const nonWatchingConnector = new FileConnector(nonWatchingDataSource);

            await nonWatchingConnector.connect();
            expect(nonWatchingConnector.isFileWatchingEnabled()).toBe(false);
            expect(nonWatchingConnector.getWatchedPaths().length).toBe(0);

            await nonWatchingConnector.disconnect();
        });

        it('should detect file changes and trigger callbacks', (done) => {
            const testFile = path.join(testDir, 'watched.txt');
            let callbackTriggered = false;

            const changeCallback = (event: FileWatchEvent) => {
                if (event.filePath === testFile && event.eventType === 'change') {
                    callbackTriggered = true;
                    expect(event.timestamp).toBeInstanceOf(Date);
                    done();
                }
            };

            connector.connect().then(() => {
                connector.onFileChange(changeCallback);

                // Trigger a file change after a short delay
                setTimeout(async () => {
                    try {
                        await fs.writeFile(testFile, 'Modified content');

                        // If callback wasn't triggered after reasonable time, fail the test
                        setTimeout(() => {
                            if (!callbackTriggered) {
                                done(new Error('File change callback was not triggered'));
                            }
                        }, 1000);
                    } catch (error) {
                        done(error);
                    }
                }, 100);
            }).catch(done);
        }, 5000);

        it('should detect file additions', (done) => {
            const newFile = path.join(testDir, 'new-file.txt');
            let callbackTriggered = false;

            const changeCallback = (event: FileWatchEvent) => {
                if (event.filePath === newFile && event.eventType === 'add') {
                    callbackTriggered = true;
                    done();
                }
            };

            connector.connect().then(() => {
                connector.onFileChange(changeCallback);

                setTimeout(async () => {
                    try {
                        await fs.writeFile(newFile, 'New file content');

                        setTimeout(() => {
                            if (!callbackTriggered) {
                                done(new Error('File addition callback was not triggered'));
                            }
                        }, 1000);
                    } catch (error) {
                        done(error);
                    }
                }, 100);
            }).catch(done);
        }, 5000);

        it('should detect file deletions', (done) => {
            const testFile = path.join(testDir, 'to-delete.txt');
            let callbackTriggered = false;

            // Create file first
            fs.writeFile(testFile, 'Content to delete').then(() => {
                const changeCallback = (event: FileWatchEvent) => {
                    if (event.filePath === testFile && event.eventType === 'unlink') {
                        callbackTriggered = true;
                        done();
                    }
                };

                connector.connect().then(() => {
                    connector.onFileChange(changeCallback);

                    setTimeout(async () => {
                        try {
                            await fs.unlink(testFile);

                            setTimeout(() => {
                                if (!callbackTriggered) {
                                    done(new Error('File deletion callback was not triggered'));
                                }
                            }, 1000);
                        } catch (error) {
                            done(error);
                        }
                    }, 100);
                }).catch(done);
            }).catch(done);
        }, 5000);

        it('should allow registering and unregistering callbacks', async () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            await connector.connect();

            connector.onFileChange(callback1);
            connector.onFileChange(callback2);

            // Trigger manual event
            connector.triggerFileChangeEvent('/test/path.txt', 'change');

            expect(callback1).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: '/test/path.txt',
                timestamp: expect.any(Date)
            });
            expect(callback2).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: '/test/path.txt',
                timestamp: expect.any(Date)
            });

            // Unregister one callback
            connector.offFileChange(callback1);
            callback1.mockClear();
            callback2.mockClear();

            connector.triggerFileChangeEvent('/test/path2.txt', 'add');

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledWith({
                eventType: 'add',
                filePath: '/test/path2.txt',
                timestamp: expect.any(Date)
            });
        });

        it('should filter out unsupported file types from watch events', async () => {
            const callback = jest.fn();
            await connector.connect();
            connector.onFileChange(callback);

            // Trigger events for supported and unsupported files
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'change');
            connector.triggerFileChangeEvent(path.join(testDir, 'test.xyz'), 'change');

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: path.join(testDir, 'test.txt'),
                timestamp: expect.any(Date)
            });
        });

        it('should filter out excluded files from watch events', async () => {
            const callback = jest.fn();
            await connector.connect();
            connector.onFileChange(callback);

            // Trigger events for included and excluded files
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'change');
            connector.triggerFileChangeEvent(path.join(testDir, 'test.tmp'), 'change');

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: path.join(testDir, 'test.txt'),
                timestamp: expect.any(Date)
            });
        });

        it('should stop watching when disconnected', async () => {
            await connector.connect();
            expect(connector.isFileWatchingEnabled()).toBe(true);

            await connector.disconnect();
            expect(connector.isFileWatchingEnabled()).toBe(false);
            expect(connector.getWatchedPaths().length).toBe(0);
        });
    });
});