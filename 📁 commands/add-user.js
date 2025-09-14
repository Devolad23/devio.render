const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-user')
        .setDescription('إضافة مستخدم إلى قائمة البث')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المراد إضافته')
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
            userData = { broadcastList: [], lastUpdated: null };
        }

        // Check if user is already in list
        if (userData.broadcastList.includes(userId)) {
            return await interaction.reply(`❌ ${targetUser.tag} موجود بالفعل في قائمة البث.`);
        }

        // Add user to list
        userData.broadcastList.push(userId);
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
            
            logger.info(`User added to broadcast list: ${targetUser.tag} (${userId}) by ${interaction.user.tag}`);
            
            return await interaction.reply(`✅ **تم إضافة المستخدم بنجاح!**\n👤 ${targetUser.tag} تم إضافته إلى قائمة البث.\n📊 إجمالي المستخدمين: ${userData.broadcastList.length}`);
            
        } catch (error) {
            logger.error('Failed to save user list:', error);
            return await interaction.reply('❌ فشل في حفظ قائمة المستخدمين. يرجى المحاولة مرة أخرى.');
        }
    }
};
