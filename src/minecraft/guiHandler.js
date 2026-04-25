/**
 * GUI Handler - Handles clicking items in Minecraft GUI windows.
 * Specifically designed to find and click the "AFK 27" button in the hub selector.
 */

const logger = require('../utils/logger');

/**
 * Waits for a GUI window to open and clicks the item matching the target name.
 * @param {import('mineflayer').Bot} bot - The mineflayer bot instance
 * @param {string} targetItemName - The name of the item/button to click (e.g. "AFK 27")
 * @param {string} accountName - Account label for logging
 * @param {number} timeout - How long to wait for the window (ms)
 * @returns {Promise<boolean>} - Whether the click was successful
 */
async function clickGuiItem(bot, targetItemName, accountName, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logger.warn(`GUI window did not open within ${timeout / 1000}s`, accountName);
      bot.removeListener('windowOpen', onWindowOpen);
      resolve(false);
    }, timeout);

    async function onWindowOpen(window) {
      clearTimeout(timer);
      logger.info(`GUI window opened: "${window.title || 'Untitled'}" with ${window.slots.length} slots`, accountName);

      // Small delay to let slots populate
      await sleep(500);

      let targetSlot = null;

      for (let i = 0; i < window.slots.length; i++) {
        const slot = window.slots[i];
        if (!slot) continue;

        // Check display name (custom name)
        const displayName = slot.customName || slot.displayName || slot.name || '';
        const nbtName = extractNbtName(slot);

        const nameToCheck = (displayName + ' ' + nbtName).toLowerCase();

        logger.debug(`  Slot ${i}: "${displayName}" | nbt: "${nbtName}" | id: ${slot.type}`, accountName);

        if (nameToCheck.includes(targetItemName.toLowerCase())) {
          targetSlot = i;
          logger.success(`Found "${targetItemName}" in slot ${i}`, accountName);
          break;
        }
      }

      if (targetSlot !== null) {
        try {
          await bot.clickWindow(targetSlot, 0, 0);
          logger.success(`Clicked "${targetItemName}" in slot ${targetSlot}`, accountName);
          resolve(true);
        } catch (err) {
          logger.error(`Failed to click slot ${targetSlot}: ${err.message}`, accountName);
          resolve(false);
        }
      } else {
        logger.warn(`Could not find "${targetItemName}" in GUI`, accountName);
        // Try to close the window
        try {
          bot.closeWindow(window);
        } catch (_) {}
        resolve(false);
      }
    }

    bot.once('windowOpen', onWindowOpen);
  });
}

/**
 * Extracts custom name from NBT data if available.
 */
function extractNbtName(item) {
  try {
    if (item.nbt && item.nbt.value) {
      const display = item.nbt.value.display;
      if (display && display.value && display.value.Name) {
        let name = display.value.Name.value;
        // Parse JSON formatted names (common in modern MC)
        try {
          const parsed = JSON.parse(name);
          if (typeof parsed === 'string') return parsed;
          if (parsed.text) return parsed.text;
          if (parsed.extra) {
            return parsed.extra.map((e) => (typeof e === 'string' ? e : e.text || '')).join('');
          }
          return JSON.stringify(parsed);
        } catch (_) {
          return name;
        }
      }
    }
  } catch (_) {}
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { clickGuiItem };
