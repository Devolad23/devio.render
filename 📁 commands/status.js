const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('عرض معلومات حالة البوت'),
    adminOnly: false,
    
    async execute(interaction, client, botSettings, saveSettings) {
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeSeconds = Math.floor(uptime % 60);
        
        const status = botSettings.isActive ? '🟢 نشط' : '🔴 غير نشط';
        const lastActivity = botSettings.lastActivity 
            ? new Date(botSettings.lastActivity).toLocaleString()
            : 'أبداً';
        
        let statusMessage = `🤖 **تقرير حالة البوت**\n\n`;
        statusMessage += `**الحالة:** ${status}\n`;
        statusMessage += `**وقت التشغيل:** ${uptimeHours}س ${uptimeMinutes}د ${uptimeSeconds}ث\n`;
        statusMessage += `**آخر نشاط:** ${lastActivity}\n`;
        statusMessage += `**البينغ:** ${client.ws.ping}ms\n\n`;
        
        statusMessage += `📊 **الإحصائيات:**\n`;
        statusMessage += `• إجمالي البث: ${botSettings.statistics?.totalBroadcasts || 0}\n`;
        statusMessage += `• الرسائل المرسلة: ${botSettings.statistics?.totalMessagesSent || 0}\n`;
        statusMessage += `• الرسائل الفاشلة: ${botSettings.statistics?.failedMessages || 0}\n`;
        statusMessage += `• المستخدمين المديرين: ${botSettings.statistics?.usersManaged || 0}\n\n`;
        
        statusMessage += `**استخدام الذاكرة:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;
        
        return await interaction.reply(statusMessage);
    }
};
