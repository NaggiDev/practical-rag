import * as fs from 'fs';
import * as path from 'path';
import { ConfigWatcher } from './configWatcher';

describe('ConfigWatcher', () => {
    const testDir = path.join(__dirname, '../../test-watch');
    const testFile1 = path.join(testDir, 'config1.json');
    const testFile2 = path.join(testDir, 'config2.json');

    beforeEach(() => {
        // Create test directory and files
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        fs.writeFileSync(testFile1, JSON.stringify({ test: 'value1' }), 'utf8');
        fs.writeFileSync(testFile2, JSON.stringify({ test: 'value2' }), 'utf8');
    });

    afterEach(() => {
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should watch files for changes', (done) => {
        const watcher = new ConfigWatcher({
            configPaths: [testFile1],
            debounceMs: 100
        });

        // Set up change listener
        watcher.on('change', (filePath) => {
            expect(filePath).toBe(testFile1);
            watcher.destroy();
            done();
        });

        // Wait a bit then modify the file
        setTimeout(() => {
            fs.writeFileSync(testFile1, JSON.stringify({ test: 'updated' }), 'utf8');
        }, 200);
    });

    it('should watch multiple files', (done) => {
        const watcher = new ConfigWatcher({
            configPaths: [testFile1, testFile2],
            debounceMs: 100
        });

        const changedFiles: string[] = [];

        // Set up change listener
        watcher.on('change', (filePath) => {
            changedFiles.push(filePath);

            if (changedFiles.length === 2) {
                expect(changedFiles).toContain(testFile1);
                expect(changedFiles).toContain(testFile2);
                watcher.destroy();
                done();
            }
        });

        // Wait a bit then modify both files
        setTimeout(() => {
            fs.writeFileSync(testFile1, JSON.stringify({ test: 'updated1' }), 'utf8');
            fs.writeFileSync(testFile2, JSON.stringify({ test: 'updated2' }), 'utf8');
        }, 200);
    });

    it('should add and remove watch paths', (done) => {
        const watcher = new ConfigWatcher({
            configPaths: [testFile1],
            debounceMs: 100
        });

        // Add second file to watch
        watcher.addWatchPath(testFile2);

        const changedFiles: string[] = [];

        // Set up change listener
        watcher.on('change', (filePath) => {
            changedFiles.push(filePath);

            if (filePath === testFile2) {
                expect(changedFiles).toContain(testFile2);
                watcher.destroy();
                done();
            }
        });

        // Remove first file from watch
        watcher.removeWatchPath(testFile1);

        // Wait a bit then modify both files
        setTimeout(() => {
            fs.writeFileSync(testFile1, JSON.stringify({ test: 'updated1' }), 'utf8');
            fs.writeFileSync(testFile2, JSON.stringify({ test: 'updated2' }), 'utf8');
        }, 200);
    });

    it('should stop and start watching', (done) => {
        const watcher = new ConfigWatcher({
            configPaths: [testFile1],
            debounceMs: 100
        });

        let changeDetected = false;

        // Set up change listener
        watcher.on('change', () => {
            changeDetected = true;
        });

        // Stop watching
        watcher.stop();

        // Modify file while stopped
        fs.writeFileSync(testFile1, JSON.stringify({ test: 'updated1' }), 'utf8');

        // Wait a bit then check no change was detected
        setTimeout(() => {
            expect(changeDetected).toBe(false);

            // Start watching again
            watcher.start();

            // Modify file again
            fs.writeFileSync(testFile1, JSON.stringify({ test: 'updated2' }), 'utf8');

            // Wait for change to be detected
            setTimeout(() => {
                expect(changeDetected).toBe(true);
                watcher.destroy();
                done();
            }, 300);
        }, 300);
    });

    it('should check if file has been modified', async () => {
        const watcher = new ConfigWatcher({
            configPaths: [testFile1],
            enabled: false // Don't start watching automatically
        });

        // Initial check should return true
        let modified = await watcher.checkModified(testFile1);
        expect(modified).toBe(true);

        // Second check without changes should return false
        modified = await watcher.checkModified(testFile1);
        expect(modified).toBe(false);

        // Modify file
        fs.writeFileSync(testFile1, JSON.stringify({ test: 'modified' }), 'utf8');

        // Check after modification should return true
        modified = await watcher.checkModified(testFile1);
        expect(modified).toBe(true);

        watcher.destroy();
    });

    it('should handle non-existent files', async () => {
        const nonExistentFile = path.join(testDir, 'non-existent.json');

        const watcher = new ConfigWatcher({
            configPaths: [nonExistentFile],
            debounceMs: 100
        });

        // Check should return false for non-existent file
        const modified = await watcher.checkModified(nonExistentFile);
        expect(modified).toBe(false);

        watcher.destroy();
    });
});