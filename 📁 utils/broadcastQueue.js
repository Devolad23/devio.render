const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class BroadcastQueue {
    constructor() {
        this.isRunning = false;
        this.isPaused = false;
        this.currentJob = null;
        this.stateFile = path.join(__dirname, '..', 'data', 'broadcast-state.json');
        this.baseDelayMs = 1200; // Safe base delay: 1.2 seconds
        this.maxDelayMs = 1800; // Max delay with jitter: 1.8 seconds
        this.backoffMultiplier = 2;
        this.maxBackoff = 30000; // 30 seconds max backoff
        this.maxRetries = 3;
        
        // Load persisted state on startup
        this.loadState();
    }

    // Generate random delay with jitter to avoid pattern detection
    getRandomDelay() {
        const jitterRange = this.maxDelayMs - this.baseDelayMs;
        const jitter = Math.random() * jitterRange;
        return Math.floor(this.baseDelayMs + jitter);
    }

    // Save current state to file for persistence
    saveState() {
        try {
            if (this.currentJob) {
                fs.writeFileSync(this.stateFile, JSON.stringify(this.currentJob, null, 2));
            }
        } catch (error) {
            logger.error('Failed to save broadcast state:', error);
        }
    }

    // Load persisted state from file
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const stateData = fs.readFileSync(this.stateFile, 'utf8');
                this.currentJob = JSON.parse(stateData);
                logger.info('Loaded persisted broadcast state');
            }
        } catch (error) {
            logger.error('Failed to load broadcast state:', error);
            this.currentJob = null;
        }
    }

    // Clear persisted state
    clearState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                fs.unlinkSync(this.stateFile);
            }
            this.currentJob = null;
        } catch (error) {
            logger.error('Failed to clear broadcast state:', error);
        }
    }

    // Render template with user variables
    renderTemplate(member, guild, template) {
        return template
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user.username)
            .replace(/{tag}/g, member.user.tag)
            .replace(/{guild}/g, guild.name);
    }

    // Start a new broadcast job
    async startBroadcast(options) {
        if (this.isRunning) {
            throw new Error('Broadcast already running. Use queue controls to manage it.');
        }

        const { 
            recipients, 
            message, 
            guild, 
            interaction,
            audience = 'managed_list',
            dryRun = false 
        } = options;

        // Estimate duration
        const avgDelay = (this.baseDelayMs + this.maxDelayMs) / 2;
        const estimatedDuration = Math.ceil((recipients.length * avgDelay) / 1000 / 60); // minutes

        if (dryRun) {
            return {
                recipientCount: recipients.length,
                estimatedDuration,
                audience,
                message: message.substring(0, 100) + (message.length > 100 ? '...' : '')
            };
        }

        // Create job
        this.currentJob = {
            id: Date.now().toString(),
            recipients: recipients.map(member => ({
                id: member.id,
                username: member.user.username,
                tag: member.user.tag
            })),
            message,
            guildName: guild.name,
            guildId: guild.id,
            audience,
            currentIndex: 0,
            successCount: 0,
            failedCount: 0,
            failedUsers: [],
            startTime: Date.now(),
            estimatedDuration,
            status: 'running'
        };

        this.isRunning = true;
        this.saveState();

        logger.broadcast(`Starting safe broadcast to ${recipients.length} users`, {
            jobId: this.currentJob.id,
            audience,
            estimatedDuration: `${estimatedDuration} minutes`,
            guild: guild.name
        });

        // Start processing in background
        this.processQueue(guild.client, interaction).catch(error => {
            logger.error('Broadcast queue processing error:', error);
            this.isRunning = false;
            this.currentJob.status = 'failed';
            this.saveState();
        });

        return {
            jobId: this.currentJob.id,
            recipientCount: recipients.length,
            estimatedDuration,
            audience
        };
    }

    // Process the broadcast queue
    async processQueue(client, interaction) {
        if (!this.currentJob || !this.isRunning) return;

        const { recipients, message, guildId } = this.currentJob;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        try {
            for (let i = this.currentJob.currentIndex; i < recipients.length; i++) {
                // Check if paused
                while (this.isPaused && this.isRunning) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Check if cancelled
                if (!this.isRunning) {
                    this.currentJob.status = 'cancelled';
                    this.saveState();
                    return;
                }

                const recipientData = recipients[i];
                this.currentJob.currentIndex = i;

                try {
                    // Get member object
                    const member = await guild.members.fetch(recipientData.id).catch(() => null);
                    if (!member) {
                        this.currentJob.failedCount++;
                        this.currentJob.failedUsers.push(`${recipientData.tag} (User left server)`);
                        continue;
                    }

                    // Render message with templates
                    const renderedMessage = this.renderTemplate(member, guild, message);
                    
                    // Send with retry logic and proper 429 handling
                    await this.sendWithRetry(member, renderedMessage, guild);
                    this.currentJob.successCount++;

                } catch (error) {
                    this.currentJob.failedCount++;
                    this.currentJob.failedUsers.push(`${recipientData.tag} (${error.message})`);
                    logger.warn(`Failed to send to ${recipientData.tag}:`, error.message);
                }

                // Update progress
                if (i % 10 === 0 || i === recipients.length - 1) {
                    this.saveState();
                    
                    // Update interaction every 25 messages
                    if (i % 25 === 0 && interaction) {
                        try {
                            const progress = Math.round((i / recipients.length) * 100);
                            await interaction.editReply(
                                `📡 جاري الإرسال الآمن... (${i}/${recipients.length} - ${progress}%)\n` +
                                `✅ نجح: ${this.currentJob.successCount}\n` +
                                `❌ فشل: ${this.currentJob.failedCount}\n` +
                                `⏱️ معدل آمن: ~${Math.round(60000 / ((this.baseDelayMs + this.maxDelayMs) / 2))} رسالة/دقيقة`
                            );
                        } catch (editError) {
                            // Continue if edit fails
                        }
                    }
                }

                // Safe delay with jitter (except for last message)
                if (i < recipients.length - 1) {
                    const delay = this.getRandomDelay();
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Broadcast completed
            this.currentJob.status = 'completed';
            this.currentJob.endTime = Date.now();
            this.currentJob.actualDuration = Math.round((this.currentJob.endTime - this.currentJob.startTime) / 1000 / 60);
            
            this.saveState();
            this.isRunning = false;

            logger.broadcast('Safe broadcast completed', {
                jobId: this.currentJob.id,
                successCount: this.currentJob.successCount,
                failedCount: this.currentJob.failedCount,
                totalRecipients: recipients.length,
                actualDuration: `${this.currentJob.actualDuration} minutes`
            });

            // Send final results
            if (interaction) {
                await this.sendFinalResults(interaction);
            }

        } catch (error) {
            this.currentJob.status = 'failed';
            this.currentJob.error = error.message;
            this.saveState();
            this.isRunning = false;
            throw error;
        }
    }

    // Send message with proper retry and 429 handling
    async sendWithRetry(member, message, guild) {
        let lastError;
        let currentDelay = this.baseDelayMs;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                await member.send(`📢 **رسالة من ${guild.name}:**\n\n${message}`);
                return; // Success
            } catch (error) {
                lastError = error;

                // Handle Discord 429 rate limit
                if (error.code === 429) {
                    const retryAfter = error.retry_after ? error.retry_after * 1000 : currentDelay;
                    logger.warn(`Rate limited, waiting ${retryAfter}ms before retry`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    currentDelay = Math.min(currentDelay * this.backoffMultiplier, this.maxBackoff);
                    continue;
                }

                // Handle permanent failures (don't retry these)
                if (error.code === 50007 || // Cannot send DMs to user
                    error.code === 50001 || // Missing access
                    error.code === 10013) { // Unknown user
                    throw error;
                }

                // For other errors, wait before retry
                if (attempt < this.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay = Math.min(currentDelay * this.backoffMultiplier, this.maxBackoff);
                }
            }
        }

        throw lastError;
    }

    // Send final results to interaction
    async sendFinalResults(interaction) {
        if (!this.currentJob) return;

        const { successCount, failedCount, failedUsers, actualDuration } = this.currentJob;
        const totalRecipients = this.currentJob.recipients.length;

        let resultMessage = `✅ **اكتمل البث الآمن!**\n\n`;
        resultMessage += `📊 **الإحصائيات:**\n`;
        resultMessage += `📤 تم الإرسال: ${successCount}/${totalRecipients}\n`;
        resultMessage += `❌ فشل: ${failedCount}\n`;
        resultMessage += `⏱️ المدة الفعلية: ${actualDuration} دقيقة\n`;
        resultMessage += `🛡️ معدل آمن: لا يوجد خطر حظر\n`;

        if (failedCount > 0) {
            if (failedUsers.length <= 5) {
                resultMessage += `\n**الأعضاء الذين فشل إرسالهم:**\n${failedUsers.join('\n')}\n`;
            } else {
                resultMessage += `\n**الأعضاء الذين فشل إرسالهم:**\n${failedUsers.slice(0, 5).join('\n')}\n... و ${failedUsers.length - 5} آخرين\n`;
            }
        }

        try {
            await interaction.editReply(resultMessage);
        } catch (error) {
            logger.warn('Failed to send final results to interaction');
        }

        // Save detailed results to file
        const resultsFile = path.join(__dirname, '..', 'data', `broadcast-results-${this.currentJob.id}.json`);
        try {
            fs.writeFileSync(resultsFile, JSON.stringify(this.currentJob, null, 2));
            logger.info(`Detailed results saved to ${resultsFile}`);
        } catch (error) {
            logger.warn('Failed to save detailed results:', error);
        }
    }

    // Get current queue status
    getStatus() {
        if (!this.currentJob) {
            return { status: 'idle', message: 'لا يوجد بث جاري' };
        }

        const progress = this.currentJob.recipients.length > 0 
            ? Math.round((this.currentJob.currentIndex / this.currentJob.recipients.length) * 100)
            : 0;

        return {
            status: this.currentJob.status,
            jobId: this.currentJob.id,
            progress,
            currentIndex: this.currentJob.currentIndex,
            totalRecipients: this.currentJob.recipients.length,
            successCount: this.currentJob.successCount,
            failedCount: this.currentJob.failedCount,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            estimatedDuration: this.currentJob.estimatedDuration,
            actualDuration: this.currentJob.actualDuration
        };
    }

    // Pause current broadcast
    pause() {
        if (!this.isRunning) {
            throw new Error('لا يوجد بث جاري لإيقافه');
        }
        this.isPaused = true;
        logger.info('Broadcast paused by admin');
        return 'تم إيقاف البث مؤقتاً';
    }

    // Resume paused broadcast
    resume() {
        if (!this.isRunning) {
            throw new Error('لا يوجد بث جاري لاستئنافه');
        }
        if (!this.isPaused) {
            throw new Error('البث يعمل بالفعل');
        }
        this.isPaused = false;
        logger.info('Broadcast resumed by admin');
        return 'تم استئناف البث';
    }

    // Cancel current broadcast
    cancel() {
        if (!this.isRunning) {
            throw new Error('لا يوجد بث جاري لإلغائه');
        }
        this.isRunning = false;
        this.isPaused = false;
        if (this.currentJob) {
            this.currentJob.status = 'cancelled';
            this.saveState();
        }
        logger.info('Broadcast cancelled by admin');
        return 'تم إلغاء البث';
    }

    // Resume interrupted broadcast on startup
    async resumeInterrupted(client) {
        if (!this.currentJob || this.currentJob.status !== 'running') {
            return false;
        }

        logger.info(`Resuming interrupted broadcast (Job ID: ${this.currentJob.id})`);
        
        try {
            const guild = client.guilds.cache.get(this.currentJob.guildId);
            if (!guild) {
                logger.error('Cannot resume broadcast: guild not found');
                this.clearState();
                return false;
            }

            this.isRunning = true;
            this.processQueue(client, null); // No interaction on resume
            return true;
        } catch (error) {
            logger.error('Failed to resume interrupted broadcast:', error);
            this.clearState();
            return false;
        }
    }
}

// Export singleton instance
module.exports = new BroadcastQueue();
