// Keep-alive system to prevent Replit from sleeping
const express = require('express');
const fs = require('fs');
const logger = require('./utils/logger');

// Create Express app for better UptimeRobot integration
const app = express();
app.use(express.json());

// Root endpoint for UptimeRobot monitoring
app.get('/', (req, res) => {
    const status = {
        status: 'نشط ✅',
        service: 'Discord Bot 24/7',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        message: 'البوت يعمل بنجاح'
    };
    res.json(status);
});

// Health check endpoint
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Bot status endpoint
app.get('/status', (req, res) => {
    try {
        let botStats = {
            bot_status: 'نشط',
            uptime_seconds: Math.floor(process.uptime()),
            service: 'Discord Broadcast Bot'
        };

        try {
            const settings = JSON.parse(fs.readFileSync('./data/settings.json', 'utf8'));
            const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
            
            botStats = {
                ...botStats,
                total_users: users.length,
                is_active: settings.isActive,
                last_activity: settings.lastActivity
            };
        } catch (error) {
            // Use basic stats if files not available
        }

        res.json(botStats);
    } catch (error) {
        res.status(500).json({
            status: 'خطأ',
            error: error.message
        });
    }
});

// Legacy endpoint for simple monitoring
app.get('/health', (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Discord Bot is running 24/7!\n');
});

// Start the keep-alive server with UptimeRobot support
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Keep-alive server running on port ${PORT}`);
    logger.info(`📡 UptimeRobot Monitor: http://0.0.0.0:${PORT}`);
    logger.info(`🔗 Health check: http://0.0.0.0:${PORT}/ping`);
    logger.info(`📊 Bot status: http://0.0.0.0:${PORT}/status`);
});

// Ping external services periodically to maintain activity
const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
const EXTERNAL_URLS = [
    'https://www.google.com',
    'https://discord.com',
    'https://github.com'
];

function pingExternalServices() {
    EXTERNAL_URLS.forEach(url => {
        const request = require('https').get(url, (res) => {
            logger.debug(`Pinged ${url} - Status: ${res.statusCode}`);
        }).on('error', (err) => {
            logger.debug(`Ping failed for ${url}: ${err.message}`);
        });
        
        request.setTimeout(10000, () => {
            request.destroy();
        });
    });
}

// Start pinging external services
setInterval(pingExternalServices, PING_INTERVAL);
logger.info('Keep-alive system initialized - Bot will stay online 24/7');

module.exports = server;
