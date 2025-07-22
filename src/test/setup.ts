// Test setup and global configurations
import dotenv from 'dotenv';
import { jestSetup, jestTeardown } from '../data/migrations/testSetup';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test timeout
jest.setTimeout(30000);

// Database setup and teardown
beforeAll(async () => {
    await jestSetup();
});

afterAll(async () => {
    await jestTeardown();
});

// Mock console methods in tests to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};