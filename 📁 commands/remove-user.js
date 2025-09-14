const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-user')
        .setDescription('إزالة مستخدم من قائمة البث')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المراد إزالته')
                .setRequired(true)),
    adminOnly: true,
    
    async execute(interaction, client, botSettings, saveSettings) {
        // Rate limiting check
        const rateLimitResult = rateLimiter.isRateLimited(interaction.user.id, 'userManagement');
        if (rateLimitResult.limited) {
            return await interaction.reply({ 
                content: `⏰ ${rateLimitResult.message} حاول مرة أخرى خلال ${rateLimitResult.resetTime} ثانية.`, 
                ephemeral: true 
            });
        }

        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;

        // Load current user list
        let userData;
        try {
            userData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
        } catch (error) {
            return await interaction.reply('❌ لا توجد قائمة مستخدمين. يرجى إضافة مستخدمين أولاً.');
        }

        // Check if user is in list
        const userIndex = userData.broadcastList.indexOf(userId);
        if (userIndex === -1) {
            return await interaction.reply(`❌ ${targetUser.tag} غير موجود في قائمة البث.`);
        }

        // Remove user from list
        userData.broadcastList.splice(userIndex, 1);
        userData.lastUpdated = new Date().toISOString();

        // Save updated list
        try {
            fs.writeFileSync('./data/users.json', JSON.stringify(userData, null, 2));
            
            // Update statistics
            if (!botSettings.statistics) {
                botSettings.statistics = { totalBroadcasts: 0, totalMessagesSent: 0, failedMessages: 0, usersManaged: 0 };
            }
            botSettings.statistics.usersManaged++;
            saveSettings();
            
            logger.info(`User removed from broadcast list: ${targetUser.tag} (${userId}) by ${interaction.user.tag}`);
            
            return await interaction.reply(`✅ **تم حذف المستخدم بنجاح!**\n👤 ${targetUser.tag} تم حذفه من قائمة البث.\n📊 إجمالي المستخدمين: ${userData.broadcastList.length}`);
            
        } catch (error) {
            logger.error('Failed to save user list:', error);
            return await interaction.reply('❌ فشل في حفظ قائمة المستخدمين. يرجى المحاولة مرة أخرى.');
        }
    }
};
