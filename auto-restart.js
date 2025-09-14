// Auto-restart system to ensure 24/7 operation
const { spawn } = require('child_process');
const logger = require('./utils/logger');

function startBot() {
    logger.info('Starting Discord Bot...');
    
    const bot = spawn('node', ['index.js'], {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: { ...process.env }
    });
    
    bot.on('close', (code) => {
        logger.warn(`Bot process exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(startBot, 5000);
    });
    
    bot.on('error', (error) => {
        logger.error('Bot process error:', error);
        setTimeout(startBot, 5000);
    });
    
    // Graceful shutdown handling
    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        bot.kill('SIGINT');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        bot.kill('SIGTERM');
        process.exit(0);
    });
}

// Start the bot
startBot();
