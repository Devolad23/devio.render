const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-users')
        .setDescription('عرض جميع المستخدمين في قائمة البث'),
    adminOnly: true,
    
    async execute(interaction, client, botSettings, saveSettings) {
        // Load user list
        let userData;
        try {
            userData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
        } catch (error) {
            return await interaction.reply('❌ لا توجد قائمة مستخدمين. يرجى إضافة مستخدمين أولاً.');
        }

        const users = userData.broadcastList || [];
        
        if (users.length === 0) {
            return await interaction.reply('📭 قائمة البث فارغة. أضف مستخدمين باستخدام `/add-user`');
        }

        let userListMessage = `📋 **قائمة البث** (${users.length} مستخدم)\n\n`;
        
        // Show first 20 users to avoid message length limits
        const displayUsers = users.slice(0, 20);
        
        for (let i = 0; i < displayUsers.length; i++) {
            const userId = displayUsers[i];
            try {
                const user = await client.users.fetch(userId);
                userListMessage += `${i + 1}. ${user.tag} (${userId})\n`;
            } catch (error) {
                userListMessage += `${i + 1}. مستخدم غير معروف (${userId})\n`;
            }
        }
        
        if (users.length > 20) {
            userListMessage += `\n... و ${users.length - 20} مستخدم آخر.`;
        }
        
        userListMessage += `\n\n**آخر تحديث:** ${userData.lastUpdated ? new Date(userData.lastUpdated).toLocaleString() : 'أبداً'}`;
        
        return await interaction.reply(userListMessage);
    }
};
