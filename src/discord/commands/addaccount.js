const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../../minecraft/botManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addaccount')
    .setDescription('Adds a new Minecraft account to accounts.json')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Account label/name to add (e.g. acc16)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name').trim();

    if (!name || name.length === 0) {
      return interaction.reply({ content: '❌ Account name cannot be empty.', ephemeral: true });
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return interaction.reply({ content: '❌ Account name can only contain letters, numbers, and underscores.', ephemeral: true });
    }

    const result = botManager.addAccount(name);
    return interaction.reply({ content: result });
  },
};
