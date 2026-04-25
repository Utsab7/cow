const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../../minecraft/botManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Stops the bot and clears its auth cache (forces re-login). Account stays in accounts.json.')
    .addStringOption((option) =>
      option
        .setName('account')
        .setDescription('Account name to clear, or "all" to clear all auth caches')
        .setRequired(true)
    ),

  async execute(interaction) {
    const accountParam = interaction.options.getString('account');

    if (accountParam.toLowerCase() === 'all') {
      const names = botManager.getAllAccountNames();
      const results = [];
      for (const name of names) {
        results.push(botManager.clearAccountAuth(name));
      }
      return interaction.reply({ content: results.join('\n') });
    }

    const result = botManager.clearAccountAuth(accountParam);
    return interaction.reply({ content: result });
  },
};
