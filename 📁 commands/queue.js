const { SlashCommandBuilder } = require('discord.js');
const broadcastQueue = require('../utils/broadcastQueue');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('إدارة طابور البث الجماعي')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('عرض حالة طابور البث الحالي'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('إيقاف البث الجماعي مؤقتاً'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('استئناف البث الجماعي المتوقف'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('إلغاء البث الجماعي نهائياً')),
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'pause':
                    await this.handlePause(interaction);
                    break;
                case 'resume':
                    await this.handleResume(interaction);
                    break;
                case 'cancel':
                    await this.handleCancel(interaction);
                    break;
                default:
                    await interaction.reply({ content: '❌ أمر غير صحيح', ephemeral: true });
            }
        } catch (error) {
            logger.error('Queue command error:', error);
            await interaction.reply({ 
                content: `❌ حدث خطأ: ${error.message}`, 
                ephemeral: true 
            });
        }
    },

    async handleStatus(interaction) {
        const status = broadcastQueue.getStatus();
        
        if (status.status === 'idle') {
            return await interaction.reply({
                content: '🟢 **حالة الطابور:** لا يوجد بث جاري\n\nيمكنك بدء بث جديد باستخدام أمر `/broadcast`',
                ephemeral: true
            });
        }

        let statusMessage = `📊 **حالة طابور البث**\n\n`;
        statusMessage += `🆔 **رقم المهمة:** ${status.jobId}\n`;
        statusMessage += `📈 **التقدم:** ${status.progress}% (${status.currentIndex}/${status.totalRecipients})\n`;
        statusMessage += `✅ **نجح:** ${status.successCount}\n`;
        statusMessage += `❌ **فشل:** ${status.failedCount}\n`;
        statusMessage += `⏱️ **المدة المقدرة:** ${status.estimatedDuration} دقيقة\n`;
        
        if (status.actualDuration) {
            statusMessage += `⏰ **المدة الفعلية:** ${status.actualDuration} دقيقة\n`;
        }

        // Status indicators
        if (status.isRunning && status.isPaused) {
            statusMessage += `\n⏸️ **الحالة:** متوقف مؤقتاً`;
        } else if (status.isRunning) {
            statusMessage += `\n▶️ **الحالة:** يعمل`;
        } else if (status.status === 'completed') {
            statusMessage += `\n✅ **الحالة:** مكتمل`;
        } else if (status.status === 'cancelled') {
            statusMessage += `\n❌ **الحالة:** ملغي`;
        } else if (status.status === 'failed') {
            statusMessage += `\n💥 **الحالة:** فشل`;
        }

        statusMessage += `\n\n🛡️ **معدل آمن:** ~50 رسالة/دقيقة (لا يوجد خطر حظر)`;

        await interaction.reply({ content: statusMessage, ephemeral: true });
    },

    async handlePause(interaction) {
        try {
            const result = broadcastQueue.pause();
            await interaction.reply({ 
                content: `⏸️ ${result}\n\nيمكنك استئناف البث باستخدام \`/queue resume\``, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: `❌ ${error.message}`, 
                ephemeral: true 
            });
        }
    },

    async handleResume(interaction) {
        try {
            const result = broadcastQueue.resume();
            await interaction.reply({ 
                content: `▶️ ${result}`, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: `❌ ${error.message}`, 
                ephemeral: true 
            });
        }
    },

    async handleCancel(interaction) {
        try {
            const result = broadcastQueue.cancel();
            await interaction.reply({ 
                content: `❌ ${result}\n\n💡 يمكنك بدء بث جديد باستخدام \`/broadcast\``, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: `❌ ${error.message}`, 
                ephemeral: true 
            });
        }
    }
};
