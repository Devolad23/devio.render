const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mention')
        .setDescription('الحصول على رمز المنشن لمستخدم')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم المراد الحصول على منشن له')
                .setRequired(true)),
    adminOnly: false, // Available to all users
    
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        
        let responseMessage = `👤 **معلومات المنشن للمستخدم:**\n\n`;
        responseMessage += `**الاسم:** ${user.username}\n`;
        responseMessage += `**التاغ:** ${user.tag}\n`;
        responseMessage += `**المعرف:** ${user.id}\n\n`;
        responseMessage += `**رمز المنشن:** \`<@${user.id}>\`\n`;
        responseMessage += `**النتيجة:** ${user}\n\n`;
        responseMessage += `💡 **للاستخدام في البث:**\n`;
        responseMessage += `استخدم \`{user}\` في رسالة البث للإشارة للمستلم\n`;
        responseMessage += `مثال: "مرحباً {user}، لديك رسالة جديدة!"`;

        await interaction.reply({ 
            content: responseMessage, 
            ephemeral: true 
        });
    }
};
