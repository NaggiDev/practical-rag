"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class ConsoleLogger {
    formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
    }
    debug(message, context) {
        console.debug(this.formatMessage('debug', message, context));
    }
    info(message, context) {
        console.info(this.formatMessage('info', message, context));
    }
    warn(message, context) {
        console.warn(this.formatMessage('warn', message, context));
    }
    error(message, context) {
        console.error(this.formatMessage('error', message, context));
    }
}
exports.logger = new ConsoleLogger();
//# sourceMappingURL=logger.js.map