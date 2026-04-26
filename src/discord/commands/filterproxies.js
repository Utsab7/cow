const { SlashCommandBuilder } = require('discord.js');
const { exec } = require('child_process');
const path = require('path');
const botManager = require('../../minecraft/botManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filterproxies')
    .setDescription('Tests all proxies against the server and removes the dead ones (takes ~1 min)'),

  async execute(interaction) {
    await interaction.deferReply();
    await interaction.editReply('⏳ Starting proxy filter... This might take a minute or two depending on how many proxies there are. I will ping you when it is done.');

    const scriptPath = path.join(process.cwd(), 'filter-proxies.js');
    
    // Increase maxBuffer in case stdout is large
    exec(`node "${scriptPath}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return interaction.followUp(`❌ <@${interaction.user.id}> Error filtering proxies:\n\`\`\`\n${error.message}\n\`\`\``);
      }
      
      // Reload the working proxies in the bot manager
      botManager.loadProxies();
      
      // Extract the last few lines of stdout for the summary to fit in Discord
      const lines = stdout.trim().split('\n');
      const summary = lines.slice(Math.max(lines.length - 4, 0)).join('\n');
      
      interaction.followUp(`✅ <@${interaction.user.id}> **Proxy Filter Complete!**\n\`\`\`\n${summary}\n\`\`\``);
    });
  },
};
