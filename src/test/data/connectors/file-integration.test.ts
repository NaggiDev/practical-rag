import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileWatchEvent } from '../../../data/connectors/file';
import { FileConnector } from '../../../data/connectors/file';
import { DataSource, FileDataSourceConfig } from '../../../models/dataSource';

describe('FileConnector - Integration Tests', () => {
    let mockDataSource: DataSource;
    let connector: FileConnector;
    let testDir: string;

    beforeEach(async () => {
        // Create a temporary test directory
        testDir = path.join(__dirname, '../../test-data/file-integration-test');
        await fs.mkdir(testDir, { recursive: true });

        mockDataSource = {
            id: 'test-file-source',
            name: 'Test File Source',
            type: 'file',
            config: {
                filePath: testDir,
                fileTypes: ['txt', 'md'],
                watchForChanges: true,
                recursive: true,
                excludePatterns: ['*.tmp']
            } as FileDataSourceConfig,
            status: 'active',
            lastSync: new Date(),
            documentCount: 0
        };

        connector = new FileConnector(mockDataSource);
    });

    afterEach(async () => {
        // Clean up
        if (connector) {
            await connector.disconnect();
        }
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('basic functionality', () => {
        it('should connect and validate configuration', async () => {
            await connector.connect();
            expect(connector.getConnectionStatus()).toBe(true);

            const isValid = await connector.validateConnection();
            expect(isValid).toBe(true);
        });

        it('should discover and process text files', async () => {
            // Create test files
            await fs.writeFile(path.join(testDir, 'test1.txt'), 'Content of test file 1');
            await fs.writeFile(path.join(testDir, 'test2.md'), '# Markdown Title\n\nMarkdown content');
            await fs.writeFile(path.join(testDir, 'ignored.tmp'), 'This should be ignored');

            await connector.connect();
            const content = await connector.getContent();

            expect(content.length).toBe(2);

            const txtContent = content.find(c => c.metadata.fileType === 'txt');
            const mdContent = content.find(c => c.metadata.fileType === 'md');

            expect(txtContent).toBeDefined();
            expect(txtContent!.text).toBe('Content of test file 1');
            expect(txtContent!.title).toBe('test1');

            expect(mdContent).toBeDefined();
            expect(mdContent!.title).toBe('test2');
        });

        it('should perform sync operations', async () => {
            // Create initial files
            await fs.writeFile(path.join(testDir, 'file1.txt'), 'Initial content 1');
            await fs.writeFile(path.join(testDir, 'file2.txt'), 'Initial content 2');

            await connector.connect();

            // Full sync
            const syncResult = await connector.sync(false);
            expect(syncResult.success).toBe(true);
            expect(syncResult.documentsProcessed).toBe(2);
            expect(syncResult.documentsAdded).toBe(2);
            expect(syncResult.errors).toHaveLength(0);

            // Add a new file
            await fs.writeFile(path.join(testDir, 'file3.txt'), 'New content');

            // Incremental sync should process only the new file
            const incrementalResult = await connector.sync(true);
            expect(incrementalResult.success).toBe(true);
            expect(incrementalResult.documentsProcessed).toBe(1);
        });

        it('should handle health checks', async () => {
            await connector.connect();

            const health = await connector.healthCheck();
            expect(health.sourceId).toBe(mockDataSource.id);
            expect(health.isHealthy).toBe(true);
            expect(health.lastCheck).toBeInstanceOf(Date);
            expect(health.responseTime).toBeGreaterThan(0);
            expect(health.errorCount).toBe(0);
        });

        it('should track metrics', async () => {
            await connector.connect();

            // Perform some operations to generate metrics
            await connector.validateConnection();
            await connector.getContent();

            const metrics = connector.getMetrics();
            expect(metrics.totalQueries).toBeGreaterThan(0);
            expect(metrics.successfulQueries).toBeGreaterThan(0);
            expect(metrics.failedQueries).toBe(0);
            expect(metrics.lastQueryTime).toBeInstanceOf(Date);
        });
    });

    describe('file watching integration', () => {
        it('should set up file watching correctly', async () => {
            await connector.connect();

            expect(connector.isFileWatchingEnabled()).toBe(true);
            expect(connector.getWatchedPaths()).toContain(testDir);
        });

        it('should handle callback registration', async () => {
            const events: FileWatchEvent[] = [];
            const callback = (event: FileWatchEvent) => {
                events.push(event);
            };

            await connector.connect();
            connector.onFileChange(callback);

            // Simulate file events
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'add');
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'change');
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'unlink');

            expect(events).toHaveLength(3);
            expect(events[0]?.eventType).toBe('add');
            expect(events[1]?.eventType).toBe('change');
            expect(events[2]?.eventType).toBe('unlink');
        });

        it('should clean up watchers on disconnect', async () => {
            await connector.connect();
            expect(connector.isFileWatchingEnabled()).toBe(true);
            expect(connector.getWatchedPaths().length).toBeGreaterThan(0);

            await connector.disconnect();
            expect(connector.isFileWatchingEnabled()).toBe(false);
            expect(connector.getWatchedPaths().length).toBe(0);
        });
    });

    describe('error handling', () => {
        it('should handle invalid file paths gracefully', async () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: { ...mockDataSource.config, filePath: '/non/existent/path' } as FileDataSourceConfig
            };
            const invalidConnector = new FileConnector(invalidDataSource);

            await expect(invalidConnector.connect()).rejects.toThrow();
        });

        it('should handle sync errors gracefully', async () => {
            // Create a directory that looks like a file to cause issues
            const problematicPath = path.join(testDir, 'problem.txt');
            await fs.mkdir(problematicPath);

            await connector.connect();
            const result = await connector.sync();

            // Should not throw, but should report errors
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});