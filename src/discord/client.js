/**
 * Discord Client Setup
 *
 * Initializes the Discord bot, loads slash commands, handles interactions,
 * and sets up the live chat feed channel for Minecraft messages.
 */

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const botManager = require('../minecraft/botManager');

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.commands = new Collection();
    this.feedChannel = null;
  }

  /**
   * Loads all slash command files from the commands directory.
   */
  loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if (command.data && command.execute) {
        this.commands.set(command.data.name, command);
        logger.info(`Loaded command: /${command.data.name}`);
      }
    }
  }

  /**
   * Registers slash commands with Discord API.
   */
  async registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commandData = this.commands.map((cmd) => cmd.data.toJSON());

    try {
      logger.info(`Registering ${commandData.length} slash command(s)...`);
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
        body: commandData,
      });
      logger.success(`Successfully registered ${commandData.length} slash command(s)!`);
    } catch (err) {
      logger.error(`Failed to register commands: ${err.message}`);
    }
  }

  /**
   * Sets up event listeners for the Discord client.
   */
  setupEvents() {
    // Ready event
    this.client.once('ready', async () => {
      logger.success(`Discord bot logged in as ${this.client.user.tag}`);

      // Get the feed channel
      const channelId = process.env.DISCORD_CHANNEL_ID;
      if (channelId) {
        try {
          this.feedChannel = await this.client.channels.fetch(channelId);
          logger.success(`Feed channel set: #${this.feedChannel.name}`);
        } catch (err) {
          logger.error(`Could not fetch feed channel (${channelId}): ${err.message}`);
        }
      }

      // Wire up Minecraft → Discord callbacks
      this.setupMinecraftCallbacks();
    });

    // Interaction handler
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error(`Command /${interaction.commandName} failed: ${err.message}`);
        const content = '❌ An error occurred while executing this command.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content }).catch(() => {});
        } else {
          await interaction.reply({ content, ephemeral: true }).catch(() => {});
        }
      }
    });
  }

  /**
   * Sets up callbacks so Minecraft events get forwarded to Discord.
   */
  setupMinecraftCallbacks() {
    botManager.setCallbacks({
      // Forward Minecraft chat to the Discord feed channel
      onChatMessage: (accountName, username, message) => {
        if (!this.feedChannel) return;

        // Turn off public chat from other people
        if (username) return;

        // Format: [acc1] system message
        // System message - truncate if too long
        const truncated = message.length > 500 ? message.substring(0, 500) + '...' : message;
        const content = `\`[${accountName}]\` ${truncated}`;

        this.feedChannel.send(content).catch((err) => {
          logger.error(`Failed to send to Discord: ${err.message}`);
        });
      },

      // Alert on status changes (death, max retries, etc.)
      onStatusChange: (accountName, status, detail) => {
        if (!this.feedChannel) return;

        if (status === 'died') {
          const embed = new EmbedBuilder()
            .setTitle('💀 Bot Died')
            .setDescription(`**${accountName}** died in-game!`)
            .setColor(0xed4245)
            .setTimestamp();
          this.feedChannel.send({ embeds: [embed] }).catch(() => {});
        }

        if (status === 'max_retries') {
          const embed = new EmbedBuilder()
            .setTitle('🚫 Max Retries Reached')
            .setDescription(`**${accountName}** — ${detail}`)
            .setColor(0xed4245)
            .setTimestamp();
          this.feedChannel.send({ embeds: [embed] }).catch(() => {});
        }

        if (status === 'updating') {
          const embed = new EmbedBuilder()
            .setTitle('🔄 Server Updating')
            .setDescription(`**${accountName}** — ${detail}\nBot will auto-reconnect when the server is back.`)
            .setColor(0xf0b232)
            .setTimestamp();
          this.feedChannel.send({ embeds: [embed] }).catch(() => {});
        }
      },

      // Alert on disconnect
      onDisconnect: (accountName, reason) => {
        if (!this.feedChannel) return;

        const embed = new EmbedBuilder()
          .setTitle('🔌 Bot Disconnected')
          .setDescription(`**${accountName}** disconnected.\n\`\`\`${reason}\`\`\``)
          .setColor(0xfee75c)
          .setTimestamp();
        this.feedChannel.send({ embeds: [embed] }).catch(() => {});
      },

      // Alert when AFK is reached
      onAfkReached: (accountName) => {
        if (!this.feedChannel) return;

        const embed = new EmbedBuilder()
          .setTitle('💤 AFK Reached')
          .setDescription(`**${accountName}** has successfully joined the **AFK Lobby** and is now idling.`)
          .setColor(0x57f287)
          .setTimestamp();
        this.feedChannel.send({ embeds: [embed] }).catch(() => {});
      },

      // Device code auth prompt — forward to Discord
      onDeviceCode: (accountName, data) => {
        if (!this.feedChannel) return;

        const embed = new EmbedBuilder()
          .setTitle('🔑 Microsoft Login Required')
          .setDescription(
            `**Account:** ${accountName}\n\n` +
            `**1.** Open: [${data.verification_uri}](${data.verification_uri})\n` +
            `**2.** Enter code: \`${data.user_code}\`\n` +
            `**3.** Sign in with your Microsoft account\n\n` +
            `⏳ Code expires in **${Math.floor((data.expires_in || 900) / 60)} minutes**`
          )
          .setColor(0x5865f2)
          .setTimestamp();
        this.feedChannel.send({ embeds: [embed] }).catch(() => {});
      },

      // Teleport detection — staff alert
      onTeleportDetected: (accountName, from, to, distance) => {
        if (!this.feedChannel) return;

        const embed = new EmbedBuilder()
          .setTitle('🚨 TELEPORT DETECTED')
          .setDescription(
            `**${accountName}** was teleported **${Math.round(distance)} blocks**!\n` +
            `Bot has been **disconnected** for safety.\n\n` +
            `**From:** X:${from.x} Y:${from.y} Z:${from.z}\n` +
            `**To:** X:${to.x} Y:${to.y} Z:${to.z}`
          )
          .setColor(0xff0000)
          .setTimestamp();
        this.feedChannel.send({ embeds: [embed] }).catch(() => {});
      },

      // Username mention in chat — freeze alert
      onMentionDetected: (accountName, chatMessage) => {
        if (!this.feedChannel) return;

        const embed = new EmbedBuilder()
          .setTitle('💬 Bot Mentioned in Chat')
          .setDescription(
            `**${accountName}** was mentioned!\nMovement **frozen**.\n\n` +
            `\`\`\`${chatMessage}\`\`\`\n` +
            `Use \`/chat\` to respond manually.`
          )
          .setColor(0xe67e22)
          .setTimestamp();
        this.feedChannel.send({ embeds: [embed] }).catch(() => {});
      },
    });
  }

  /**
   * Starts the Discord bot.
   */
  async start() {
    this.loadCommands();
    this.setupEvents();

    try {
      await this.client.login(process.env.DISCORD_TOKEN);
      // Register commands after login
      await this.registerCommands();
    } catch (err) {
      logger.error(`Failed to start Discord bot: ${err.message}`);
      throw err;
    }
  }
}

module.exports = DiscordBot;
