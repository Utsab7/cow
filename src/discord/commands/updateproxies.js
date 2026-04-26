const { SlashCommandBuilder } = require('discord.js');
const { exec } = require('child_process');
const path = require('path');
const botManager = require('../../minecraft/botManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updateproxies')
    .setDescription('Fetches the latest proxies from Proxifly and updates proxies.txt'),

  async execute(interaction) {
    await interaction.deferReply();

    const scriptPath = path.join(process.cwd(), 'update-proxies.js');
    
    exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        return interaction.editReply(`❌ Error updating proxies:\n\`\`\`\n${error.message}\n\`\`\``);
      }
      
      // Reload proxies in the bot manager so bots can use them immediately
      botManager.loadProxies();
      
      interaction.editReply(`✅ **Proxies Updated Successfully!**\n\`\`\`\n${stdout.trim()}\n\`\`\``);
    });
  },
};
