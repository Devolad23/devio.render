#!/usr/bin/env node

// ملف البدء الرئيسي للمشروع - يشغل البوت والسيرفر معاً
const { spawn } = require('child_process');
const logger = require('./utils/logger');

logger.info('🚀 Starting Discord Bot with UptimeRobot Monitor...');

// تشغيل البوت الرئيسي
const botProcess = spawn('node', ['auto-restart.js'], {
    stdio: 'inherit',
    env: { ...process.env }
});

// معالجة أخطاء البوت
botProcess.on('error', (error) => {
    logger.error('Bot process error:', error);
});

botProcess.on('close', (code) => {
    logger.warn(`Bot process closed with code ${code}`);
    if (code !== 0) {
        logger.info('Restarting bot process...');
        // إعادة تشغيل البوت في حالة الخطأ
        setTimeout(() => {
            spawn('node', ['start.js'], { stdio: 'inherit' });
        }, 5000);
    }
});

// معالجة إشارات النظام للإغلاق النظيف
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    botProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    botProcess.kill('SIGTERM');
    process.exit(0);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // لا نغلق العملية للحفاظ على استمرارية الخدمة
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
