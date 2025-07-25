"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const testSetup_1 = require("../data/migrations/testSetup");
dotenv_1.default.config({ path: '.env.test' });
jest.setTimeout(30000);
beforeAll(async () => {
    await (0, testSetup_1.jestSetup)();
});
afterAll(async () => {
    await (0, testSetup_1.jestTeardown)();
});
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
//# sourceMappingURL=setup.js.map