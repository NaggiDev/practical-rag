import * as fs from 'fs/promises';
import * as path from 'path';
import { FileConnector } from '../../../data/connectors/file';
import { DataSource, FileDataSourceConfig } from '../../../models/dataSource';

describe('FileConnector - File System Monitoring', () => {
    let mockDataSource: DataSource;
    let connector: FileConnector;
    let testDir: string;

    beforeEach(async () => {
        // Create a temporary test directory
        testDir = path.join(__dirname, '../../test-data/file-monitoring-test');
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

    describe('file watching setup', () => {
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

        it('should stop watching when disconnected', async () => {
            await connector.connect();
            expect(connector.isFileWatchingEnabled()).toBe(true);

            await connector.disconnect();
            expect(connector.isFileWatchingEnabled()).toBe(false);
            expect(connector.getWatchedPaths().length).toBe(0);
        });
    });

    describe('callback management', () => {
        it('should allow registering and unregistering callbacks', async () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            await connector.connect();

            connector.onFileChange(callback1);
            connector.onFileChange(callback2);

            // Trigger manual event
            connector.triggerFileChangeEvent(path.join(testDir, 'test.txt'), 'change');

            expect(callback1).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: path.join(testDir, 'test.txt'),
                timestamp: expect.any(Date)
            });
            expect(callback2).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: path.join(testDir, 'test.txt'),
                timestamp: expect.any(Date)
            });

            // Unregister one callback
            connector.offFileChange(callback1);
            callback1.mockClear();
            callback2.mockClear();

            connector.triggerFileChangeEvent(path.join(testDir, 'test2.txt'), 'add');

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledWith({
                eventType: 'add',
                filePath: path.join(testDir, 'test2.txt'),
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
    });

    describe('manual event triggering', () => {
        it('should trigger add events correctly', async () => {
            const callback = jest.fn();
            await connector.connect();
            connector.onFileChange(callback);

            connector.triggerFileChangeEvent(path.join(testDir, 'new.txt'), 'add');

            expect(callback).toHaveBeenCalledWith({
                eventType: 'add',
                filePath: path.join(testDir, 'new.txt'),
                timestamp: expect.any(Date)
            });
        });

        it('should trigger change events correctly', async () => {
            const callback = jest.fn();
            await connector.connect();
            connector.onFileChange(callback);

            connector.triggerFileChangeEvent(path.join(testDir, 'modified.txt'), 'change');

            expect(callback).toHaveBeenCalledWith({
                eventType: 'change',
                filePath: path.join(testDir, 'modified.txt'),
                timestamp: expect.any(Date)
            });
        });

        it('should trigger unlink events correctly', async () => {
            const callback = jest.fn();
            await connector.connect();
            connector.onFileChange(callback);

            connector.triggerFileChangeEvent(path.join(testDir, 'deleted.txt'), 'unlink');

            expect(callback).toHaveBeenCalledWith({
                eventType: 'unlink',
                filePath: path.join(testDir, 'deleted.txt'),
                timestamp: expect.any(Date)
            });
        });
    });
});