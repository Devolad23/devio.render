const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');
const broadcastQueue = require('../utils/broadcastQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('إرسال رسالة جماعية آمنة للمستخدمين المشتركين')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('الرسالة المراد إرسالها (يمكن استخدام {user} للإشارة للمستخدم)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('audience')
                .setDescription('اختر نوع الجمهور')
                .setRequired(false)
                .addChoices(
                    { name: '📋 المستخدمون المشتركون فقط (آمن)', value: 'managed_list' },
                    { name: '🌐 جميع أعضاء السيرفر (يحتاج تأكيد)', value: 'server_members' }
                ))
        .addStringOption(option =>
            option.setName('speed')
                .setDescription('سرعة الإرسال')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ آمن (50 رسالة/دقيقة) - مستحسن', value: 'safe' },
                    { name: '⚡ سريع (80 رسالة/دقيقة) - محفوف بالمخاطر', value: 'fast' }
                ))
        .addBooleanOption(option =>
            option.setName('dry_run')
                .setDescription('معاينة فقط (عرض العدد والمدة بدون إرسال)')
                .setRequired(false)),
    adminOnly: true,
    
    async execute(interaction, client, botSettings, saveSettings) {
        // Rate limiting check
        const rateLimitResult = rateLimiter.isRateLimited(interaction.user.id, 'broadcast');
        if (rateLimitResult.limited) {
            return await interaction.reply({ 
                content: `⏰ ${rateLimitResult.message} حاول مرة أخرى خلال ${rateLimitResult.resetTime} ثانية.`, 
                ephemeral: true 
            });
        }

        // Check if there's already a broadcast running
        const queueStatus = broadcastQueue.getStatus();
        if (queueStatus.status !== 'idle') {
            return await interaction.reply({
                content: `⚠️ يوجد بث جاري بالفعل!\n\nاستخدم \`/queue status\` لعرض التفاصيل أو \`/queue cancel\` لإلغاء البث الحالي.`,
                ephemeral: true
            });
        }

        const message = interaction.options.getString('message');
        const audience = interaction.options.getString('audience') || 'managed_list';
        const speed = interaction.options.getString('speed') || 'safe';
        const dryRun = interaction.options.getBoolean('dry_run') || false;

        try {
            // Get recipients based on audience choice
            const recipients = await this.getRecipients(interaction, audience, client);
            
            if (recipients.length === 0) {
                let errorMsg = '❌ لا يوجد مستلمون للرسالة!\n\n';
                if (audience === 'managed_list') {
                    errorMsg += 'القائمة المُدارة فارغة. استخدم أمر `/add-user` لإضافة مستخدمين.';
                } else {
                    errorMsg += 'لا يوجد أعضاء في السيرفر.';
                }
                return await interaction.reply({ content: errorMsg, ephemeral: true });
            }

            // Configure speed settings
            if (speed === 'fast') {
                broadcastQueue.baseDelayMs = 750;  // 80 msg/min
                broadcastQueue.maxDelayMs = 1000;
            } else {
                broadcastQueue.baseDelayMs = 1200; // 50 msg/min
                broadcastQueue.maxDelayMs = 1800;
            }

            // Handle dry run
            if (dryRun) {
                const preview = await broadcastQueue.startBroadcast({
                    recipients,
                    message,
                    guild: interaction.guild,
                    interaction,
                    audience,
                    dryRun: true
                });

                let previewMsg = `📋 **معاينة البث الجماعي**\n\n`;
                previewMsg += `👥 **عدد المستلمين:** ${preview.recipientCount}\n`;
                previewMsg += `📝 **نوع الجمهور:** ${audience === 'managed_list' ? 'مستخدمون مشتركون' : 'جميع أعضاء السيرفر'}\n`;
                previewMsg += `⏱️ **المدة المقدرة:** ${preview.estimatedDuration} دقيقة\n`;
                previewMsg += `🛡️ **معدل الإرسال:** ${speed === 'safe' ? '~50' : '~80'} رسالة/دقيقة\n`;
                previewMsg += `📄 **عينة من الرسالة:**\n\`\`\`${preview.message}\`\`\`\n`;
                previewMsg += `\n💡 لبدء الإرسال الفعلي، استخدم نفس الأمر بدون \`dry_run: true\``;

                return await interaction.reply({ content: previewMsg, ephemeral: true });
            }

            // Show confirmation for server members audience
            if (audience === 'server_members') {
                const confirmed = await this.confirmServerMembersBroadcast(interaction, recipients.length, message);
                if (!confirmed) return;
            } else {
                // Quick confirmation for managed list
                const confirmed = await this.confirmManagedListBroadcast(interaction, recipients.length, message, speed);
                if (!confirmed) return;
            }

            // Start the safe broadcast
            await interaction.editReply('⏳ بدء البث الآمن...');
            
            const result = await broadcastQueue.startBroadcast({
                recipients,
                message,
                guild: interaction.guild,
                interaction,
                audience,
                dryRun: false
            });

            let startMsg = `✅ **تم بدء البث الآمن!**\n\n`;
            startMsg += `🆔 **رقم المهمة:** ${result.jobId}\n`;
            startMsg += `👥 **عدد المستلمين:** ${result.recipientCount}\n`;
            startMsg += `⏱️ **المدة المقدرة:** ${result.estimatedDuration} دقيقة\n`;
            startMsg += `🛡️ **معدل آمن:** لا يوجد خطر حظر\n`;
            startMsg += `\n📊 استخدم \`/queue status\` لمتابعة التقدم`;

            await interaction.editReply(startMsg);

            // Update statistics
            if (!botSettings.statistics) {
                botSettings.statistics = { totalBroadcasts: 0, totalMessagesSent: 0, failedMessages: 0, usersManaged: 0 };
            }
            botSettings.statistics.totalBroadcasts++;
            saveSettings();

        } catch (error) {
            logger.error('Broadcast error:', error);
            await interaction.editReply(`❌ حدث خطأ: ${error.message}`);
        }
    },

    async getRecipients(interaction, audience, client) {
        if (audience === 'managed_list') {
            // Use opt-in users from users.json
            const usersFile = path.join(__dirname, '..', 'data', 'users.json');
            
            if (!fs.existsSync(usersFile)) {
                return [];
            }

            const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            const userIds = usersData.broadcastList || [];
            
            const recipients = [];
            const guild = interaction.guild;

            for (const userId of userIds) {
                try {
                    const member = await guild.members.fetch(userId);
                    if (member && !member.user.bot) {
                        recipients.push(member);
                    }
                } catch (error) {
                    // User might have left the server
                    logger.debug(`Could not fetch user ${userId}: ${error.message}`);
                }
            }

            return recipients;
        } else {
            // Get all server members (requires extra confirmation)
            const guild = interaction.guild;
            await guild.members.fetch({ force: true });
            const members = guild.members.cache.filter(member => !member.user.bot);
            return Array.from(members.values());
        }
    },

    async confirmManagedListBroadcast(interaction, count, message, speed) {
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_managed_broadcast')
            .setLabel('✅ بدء البث الآمن')
            .setStyle(ButtonStyle.Success);
            
        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_managed_broadcast')
            .setLabel('❌ إلغاء')
            .setStyle(ButtonStyle.Danger);
        
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        let confirmMsg = `🛡️ **تأكيد البث الآمن**\n\n`;
        confirmMsg += `👥 **المستلمون:** ${count} مستخدم مشترك\n`;
        confirmMsg += `🛡️ **معدل آمن:** ${speed === 'safe' ? '~50' : '~80'} رسالة/دقيقة\n`;
        confirmMsg += `📝 **الرسالة:** "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"\n`;
        confirmMsg += `\n⚠️ تأكيد البث؟`;
        
        await interaction.reply({ content: confirmMsg, components: [row], fetchReply: true });
        
        return await this.waitForConfirmation(interaction, 'confirm_managed_broadcast', 'cancel_managed_broadcast');
    },

    async confirmServerMembersBroadcast(interaction, count, message) {
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_server_broadcast')
            .setLabel('✅ نعم - أتحمل المسؤولية')
            .setStyle(ButtonStyle.Danger);
            
        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_server_broadcast')
            .setLabel('❌ إلغاء')
            .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        let confirmMsg = `⚠️ **تحذير: بث لجميع أعضاء السيرفر**\n\n`;
        confirmMsg += `👥 **المستلمون:** ${count} عضو (جميع أعضاء السيرفر)\n`;
        confirmMsg += `📝 **الرسالة:** "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"\n`;
        confirmMsg += `\n🚨 **تحذير مهم:**\n`;
        confirmMsg += `• قد يعتبر Discord هذا رسائل مزعجة\n`;
        confirmMsg += `• قد يؤدي إلى حظر البوت أو الحساب\n`;
        confirmMsg += `• فقط للاستخدام الضروري والمُصرح به\n`;
        confirmMsg += `\nهل تريد المتابعة على مسؤوليتك؟`;
        
        await interaction.reply({ content: confirmMsg, components: [row], fetchReply: true });
        
        return await this.waitForConfirmation(interaction, 'confirm_server_broadcast', 'cancel_server_broadcast');
    },

    async waitForConfirmation(interaction, confirmId, cancelId) {
        const filter = (buttonInteraction) => {
            return buttonInteraction.user.id === interaction.user.id;
        };

        try {
            const buttonInteraction = await interaction.awaitMessageComponent({ 
                filter, 
                time: 30000 
            });

            if (buttonInteraction.customId === confirmId) {
                await buttonInteraction.update({ content: '⏳ جاري التحضير...', components: [] });
                return true;
            } else {
                await buttonInteraction.update({ content: '❌ تم إلغاء البث', components: [] });
                return false;
            }
        } catch (error) {
            await interaction.editReply({ content: '⏰ انتهت مهلة التأكيد. تم إلغاء البث', components: [] });
            return false;
        }
    }
};
