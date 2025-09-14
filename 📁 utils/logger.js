const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '../logs');
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (data) {
            logMessage += ` - ${typeof data === 'object' ? JSON.stringify(data) : data}`;
        }
        
        return logMessage;
    }

    writeToFile(message) {
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(this.logsDir, `bot-${today}.log`);
        
        fs.appendFileSync(logFile, message + '\n');
    }

    info(message, data = null) {
        const logMessage = this.formatMessage('info', message, data);
        console.log(logMessage);
        this.writeToFile(logMessage);
    }

    error(message, data = null) {
        const logMessage = this.formatMessage('error', message, data);
        console.error(logMessage);
        this.writeToFile(logMessage);
    }

    warn(message, data = null) {
        const logMessage = this.formatMessage('warn', message, data);
        console.warn(logMessage);
        this.writeToFile(logMessage);
    }

    debug(message, data = null) {
        const logMessage = this.formatMessage('debug', message, data);
        console.log(logMessage);
        this.writeToFile(logMessage);
    }

    broadcast(message, stats = null) {
        const logMessage = this.formatMessage('broadcast', message, stats);
        console.log(logMessage);
        this.writeToFile(logMessage);
    }
}

module.exports = new Logger();
