/**
 * botManager.js - Manages all Minecraft bot instances.
 * Provides a centralized API for starting, stopping, and querying bots.
 */

const fs = require('fs');
const path = require('path');
const { createBotState, connectBot, disconnectBot, getBotInfo, sendChat } = require('./createBot');
const logger = require('../utils/logger');

class BotManager {
  constructor() {
    /** @type {Map<string, import('./createBot').BotState>} */
    this.bots = new Map();
    this.accounts = [];
    this.serverConfig = {
      host: process.env.MC_SERVER_HOST || 'donutsmp.net',
      port: parseInt(process.env.MC_SERVER_PORT) || 25565,
    };
    this.callbacks = {};
    this.proxies = [];
    this.accountsPerProxy = parseInt(process.env.ACCOUNTS_PER_PROXY) || 5;
    this.loadProxies();
  }

  /**
   * Loads proxies from proxies.txt
   */
  loadProxies() {
    const proxiesPath = path.join(process.cwd(), 'proxies.txt');
    if (fs.existsSync(proxiesPath)) {
      try {
        const raw = fs.readFileSync(proxiesPath, 'utf-8');
        this.proxies = raw.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'))
          .map(line => {
            // Auto-format host:port:user:pass to http://user:pass@host:port if no protocol is specified
            if (!line.includes('://')) {
              const parts = line.split(':');
              if (parts.length === 4) {
                return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
              } else if (parts.length === 2) {
                return `http://${parts[0]}:${parts[1]}`;
              }
            }
            return line;
          });
        logger.info(`Loaded ${this.proxies.length} proxies from proxies.txt`);
      } catch (err) {
        logger.error(`Failed to parse proxies.txt: ${err.message}`);
      }
    }
  }

  /**
   * Calculates which proxy string to use for an account based on chunk size.
   */
  getProxyForAccount(accountName) {
    if (this.proxies.length > 0) {
      const index = this.accounts.findIndex(a => this.getAccountName(a) === accountName);
      if (index !== -1) {
        const proxyIndex = Math.floor(index / this.accountsPerProxy) % this.proxies.length;
        const proxyStr = this.proxies[proxyIndex];
        logger.debug(`Account ${accountName} assigned proxy #${proxyIndex + 1}`);
        return proxyStr;
      }
    }
    // Fallback to global proxy if proxies.txt is empty
    return process.env.PROXY_URL || null;
  }

  /**
   * Loads accounts from accounts.json.
   */
  loadAccounts() {
    const accountsPath = path.join(process.cwd(), 'accounts.json');
    if (!fs.existsSync(accountsPath)) {
      logger.error('accounts.json not found! Please create it with your account credentials.');
      return;
    }

    try {
      const raw = fs.readFileSync(accountsPath, 'utf-8');
      this.accounts = JSON.parse(raw);
      logger.info(`Loaded ${this.accounts.length} account(s) from accounts.json`);
    } catch (err) {
      logger.error(`Failed to parse accounts.json: ${err.message}`);
    }
  }

  /**
   * Sets Discord callbacks for chat forwarding and alerts.
   * @param {Object} callbacks
   */
  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Gets the short account name from a config entry.
   */
  getAccountName(accountConfig) {
    return accountConfig.name;
  }

  /**
   * Gets all known account names.
   * @returns {string[]}
   */
  getAllAccountNames() {
    return this.accounts.map((a) => this.getAccountName(a));
  }

  /**
   * Resolves account parameter: returns array of account names to act on.
   * @param {string} accountParam - "all" or a specific account name
   * @returns {string[]}
   */
  resolveAccounts(accountParam) {
    if (!accountParam || accountParam.toLowerCase() === 'all') {
      return this.getAllAccountNames();
    }
    return [accountParam];
  }

  /**
   * Starts a specific account's bot.
   * @param {string} accountName
   * @param {boolean} useProxy
   * @returns {string} result message
   */
  startBot(accountName, useProxy = false) {
    // Check if already running
    if (this.bots.has(accountName)) {
      const existing = this.bots.get(accountName);
      if (existing.status !== 'offline') {
        return `⚠️ **${accountName}** is already ${existing.status}.`;
      }
    }

    // Find account config
    const accountConfig = this.accounts.find((a) => this.getAccountName(a) === accountName);
    if (!accountConfig) {
      return `❌ Account **${accountName}** not found in accounts.json.`;
    }

    const state = createBotState(accountConfig, this.serverConfig, {
      onChatMessage: (acct, username, message) => {
        if (this.callbacks.onChatMessage) {
          this.callbacks.onChatMessage(acct, username, message);
        }
      },
      onStatusChange: (acct, status, detail) => {
        if (this.callbacks.onStatusChange) {
          this.callbacks.onStatusChange(acct, status, detail);
        }
      },
      onDisconnect: (acct, reason) => {
        if (this.callbacks.onDisconnect) {
          this.callbacks.onDisconnect(acct, reason);
        }
      },
      onAfkReached: (acct) => {
        if (this.callbacks.onAfkReached) {
          this.callbacks.onAfkReached(acct);
        }
      },
      onDeviceCode: (acct, data) => {
        if (this.callbacks.onDeviceCode) {
          this.callbacks.onDeviceCode(acct, data);
        }
      },
      onTeleportDetected: (acct, from, to, distance) => {
        if (this.callbacks.onTeleportDetected) {
          this.callbacks.onTeleportDetected(acct, from, to, distance);
        }
      },
      onMentionDetected: (acct, chatMessage) => {
        if (this.callbacks.onMentionDetected) {
          this.callbacks.onMentionDetected(acct, chatMessage);
        }
      },
    }, useProxy ? this.getProxyForAccount(accountName) : null);

    this.bots.set(accountName, state);
    connectBot(state);
    return `🚀 **${accountName}** is now connecting...`;
  }

  /**
   * Stops a specific account's bot.
   * @param {string} accountName
   * @returns {string} result message
   */
  stopBot(accountName) {
    const state = this.bots.get(accountName);
    if (!state) {
      return `❌ **${accountName}** is not running.`;
    }

    disconnectBot(state);
    this.bots.delete(accountName);
    return `🛑 **${accountName}** has been disconnected.`;
  }

  /**
   * Force reconnects a specific bot.
   * @param {string} accountName
   * @returns {string}
   */
  async reconnectBot(accountName) {
    // Stop if running
    const state = this.bots.get(accountName);
    const useProxy = state ? !!state.proxyUrl : false;
    
    if (state) {
      disconnectBot(state);
      this.bots.delete(accountName);
      // Wait for the server to fully release the old session
      await new Promise((r) => setTimeout(r, 4000));
    }

    // Re-start
    return this.startBot(accountName, useProxy);
  }

  /**
   * Gets status info for a bot.
   * @param {string} accountName
   * @returns {Object|null}
   */
  getStatus(accountName) {
    const state = this.bots.get(accountName);
    if (!state) {
      // Find in accounts list
      const accountConfig = this.accounts.find((a) => this.getAccountName(a) === accountName);
      if (accountConfig) {
        return {
          account: accountName,
          status: 'offline',
          health: null,
          food: null,
          position: null,
          reconnectAttempts: 0,
          playtime: null,
          shards: null,
        };
      }
      return null;
    }
    return getBotInfo(state);
  }

  /**
   * Gets status info for all bots.
   * @returns {Object[]}
   */
  getAllStatuses() {
    return this.getAllAccountNames().map((name) => this.getStatus(name));
  }

  /**
   * Sends a chat message from a specific bot.
   * @param {string} accountName
   * @param {string} message
   * @returns {string}
   */
  chat(accountName, message) {
    const state = this.bots.get(accountName);
    if (!state || state.status === 'offline') {
      return `❌ **${accountName}** is not online.`;
    }

    const success = sendChat(state, message);
    if (success) {
      return `💬 **${accountName}**: ${message}`;
    }
    return `❌ Failed to send chat from **${accountName}**.`;
  }

  /**
   * Adds a new account to accounts.json.
   * @param {string} accountName
   * @returns {string} result message
   */
  addAccount(accountName) {
    // Check if already exists
    const existing = this.accounts.find((a) => this.getAccountName(a) === accountName);
    if (existing) {
      return `⚠️ Account **${accountName}** already exists in accounts.json.`;
    }

    // Add to in-memory array
    this.accounts.push({ name: accountName });

    // Save to disk
    try {
      const accountsPath = path.join(process.cwd(), 'accounts.json');
      fs.writeFileSync(accountsPath, JSON.stringify(this.accounts, null, 2), 'utf-8');
      logger.info(`Added ${accountName} to accounts.json`);
    } catch (err) {
      logger.error(`Failed to update accounts.json: ${err.message}`);
      return `❌ Failed to save **${accountName}** to accounts.json: ${err.message}`;
    }

    return `✅ **${accountName}** has been added to accounts.json. Use \`/start account:${accountName}\` to connect it.`;
  }

  /**
   * Clears auth cache for an account — stops the bot and deletes cached tokens.
   * The account stays in accounts.json so you can re-login with a fresh device code.
   * @param {string} accountName
   * @returns {string} result message
   */
  clearAccountAuth(accountName) {
    // Check if the account exists in config
    const accountExists = this.accounts.find((a) => this.getAccountName(a) === accountName);
    if (!accountExists) {
      return `❌ Account **${accountName}** not found in accounts.json.`;
    }

    // 1. Stop the bot if it's running
    if (this.bots.has(accountName)) {
      const { disconnectBot } = require('./createBot');
      disconnectBot(this.bots.get(accountName));
      this.bots.delete(accountName);
    }

    // 2. Clear the auth cache (unlink Microsoft account)
    const profilesFolder = path.join(process.cwd(), 'auth_cache', accountName);
    let cacheCleared = false;
    if (fs.existsSync(profilesFolder)) {
      try {
        const files = fs.readdirSync(profilesFolder);
        for (const file of files) {
          fs.unlinkSync(path.join(profilesFolder, file));
        }
        fs.rmdirSync(profilesFolder);
        logger.info(`Cleared auth cache for ${accountName}`);
        cacheCleared = true;
      } catch (err) {
        logger.error(`Failed to clear auth cache: ${err.message}`);
        return `⚠️ Stopped **${accountName}** but failed to clear auth cache: ${err.message}`;
      }
    }

    if (cacheCleared) {
      return `🔓 **${accountName}** — bot stopped and auth cache cleared. Next \`/start\` will prompt a fresh Microsoft login.`;
    }
    return `🔓 **${accountName}** — bot stopped. No auth cache found (already clean).`;
  }

  /**
   * Legacy removeAccount — now just clears auth cache without removing from accounts.json.
   * @param {string} accountName
   * @returns {string}
   */
  removeAccount(accountName) {
    return this.clearAccountAuth(accountName);
  }

  /**
   * Starts all accounts with a 5-minute staggered delay between each.
   * Returns an array of result messages as they connect.
   * @param {boolean} useProxy
   * @returns {Promise<string[]>}
   */
  async startAllStaggered(useProxy = false) {
    const names = this.getAllAccountNames();
    const results = [];
    const STAGGER_DELAY = 5 * 60 * 1000; // 5 minutes between each account

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const result = this.startBot(name, useProxy);
      results.push(result);
      logger.info(`Started ${name} (${i + 1}/${names.length})`);

      // Wait 5 minutes before starting the next account (skip delay after last)
      if (i < names.length - 1) {
        logger.info(`Waiting 5 minutes before starting next account...`);
        await new Promise((r) => setTimeout(r, STAGGER_DELAY));
      }
    }

    return results;
  }

  /**
   * Starts all accounts (immediate, no delay — used for single accounts).
   * @param {boolean} useProxy
   * @returns {string[]}
   */
  startAll(useProxy = false) {
    return this.getAllAccountNames().map((name) => this.startBot(name, useProxy));
  }

  /**
   * Stops all accounts.
   * @returns {string[]}
   */
  stopAll() {
    return this.getAllAccountNames().map((name) => this.stopBot(name));
  }

  /**
   * Reconnects all accounts.
   * @returns {string[]}
   */
  reconnectAll() {
    return this.getAllAccountNames().map((name) => this.reconnectBot(name));
  }
}

// Singleton instance
const botManager = new BotManager();
module.exports = botManager;
