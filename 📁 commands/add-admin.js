const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-admin')
        .setDescription('إضافة مستخدم كمدير للبوت')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المراد إضافته كمدير (اختياري لأول مدير)')
                .setRequired(false)),
    adminOnly: true,
    
    async execute(interaction, client, botSettings, saveSettings) {
        const userId = interaction.user.id;
        
        // Check if there are any admins already
        if (botSettings.adminUsers && botSettings.adminUsers.length > 0) {
            // If there are admins, only existing admins can add new ones
            const config = require('../config/config.json');
            const isAdminUser = config.adminUsers.includes(userId) || botSettings.adminUsers.includes(userId);
            if (!isAdminUser) {
                return await interaction.reply({ content: '❌ يمكن للمشرفين الحاليين فقط إضافة مشرفين جدد.', ephemeral: true });
            }
            
            const targetUser = interaction.options.getUser('user');
            if (!targetUser) {
                return await interaction.reply({ content: '❌ يرجى تحديد المستخدم المراد إضافته كمشرف.', ephemeral: true });
            }
            
            const targetUserId = targetUser.id;
            
            if (botSettings.adminUsers.includes(targetUserId)) {
                return await interaction.reply(`❌ ${targetUser.tag} مشرف بالفعل.`);
            }
            
            botSettings.adminUsers.push(targetUserId);
            saveSettings();
            
            logger.info(`Admin added: ${targetUser.tag} (${targetUserId}) by ${interaction.user.tag}`);
            return await interaction.reply(`✅ **تم إضافة المشرف!**\n👑 ${targetUser.tag} أصبح مشرف الآن.`);
        } else {
            // First time setup - add the user who ran the command as admin
            if (!botSettings.adminUsers) {
                botSettings.adminUsers = [];
            }
            botSettings.adminUsers.push(userId);
            saveSettings();
            
            logger.info(`First admin added: ${interaction.user.tag} (${userId})`);
            return await interaction.reply(`✅ **مرحباً بك كمشرف!**\n👑 أنت الآن أول مشرف لهذا البوت.\n\nيمكنك الآن استخدام:\n• \`/add-user\` - إضافة مستخدمين لقائمة البث\n• \`/broadcast\` - إرسال رسائل لجميع المستخدمين\n• \`/status\` - حالة البوت\n• \`/list-users\` - عرض قائمة المستخدمين`);
        }
    }
};
