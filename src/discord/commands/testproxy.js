const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const botManager = require('../../minecraft/botManager');
const net = require('net');
const logger = require('../../utils/logger');

let SocksClient = null;
try { SocksClient = require('socks').SocksClient; } catch (_) { }

// A few public servers to test TCP connectivity against
const TEST_SERVERS = [
  { host: '0b0t.org', port: 25565 },
  { host: 'oldfag.org', port: 25565 },
  { host: '9b9t.org', port: 25565 },
];

/**
 * Tests a proxy with SOCKS5 protocol.
 */
async function testSocks5(host, port, proxyHost, proxyPort, username, password) {
  if (!SocksClient) throw new Error('socks package not installed');
  var socksOptions = {
    proxy: {
      host: proxyHost,
      port: proxyPort,
      type: 5,
    },
    command: 'connect',
    destination: { host: host, port: port },
    timeout: 15000,
  };
  if (username) {
    socksOptions.proxy.userId = username;
    socksOptions.proxy.password = password || '';
  }
  var info = await SocksClient.createConnection(socksOptions);
  info.socket.destroy();
  return true;
}

/**
 * Tests a proxy with HTTP CONNECT protocol.
 */
async function testHttpConnect(host, port, proxyHost, proxyPort, username, password) {
  return await new Promise(function (resolve, reject) {
    var connectReq = 'CONNECT ' + host + ':' + port + ' HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\n';
    if (username) {
      var auth = Buffer.from(username + ':' + (password || '')).toString('base64');
      connectReq += 'Proxy-Authorization: Basic ' + auth + '\r\n';
    }
    connectReq += '\r\n';
    var socket = net.connect(proxyPort, proxyHost, function () {
      socket.write(connectReq);
    });
    var responded = false;
    socket.once('data', function (chunk) {
      responded = true;
      socket.destroy();
      if (chunk.toString().includes('200')) {
        resolve(true);
      } else {
        reject(new Error('HTTP CONNECT rejected: ' + chunk.toString().split('\r\n')[0]));
      }
    });
    socket.once('error', function (err) {
      if (!responded) reject(err);
    });
    setTimeout(function () {
      if (!responded) {
        socket.destroy();
        reject(new Error('Timeout'));
      }
    }, 15000);
  });
}

/**
 * Extracts proxy details from a URL or host:port:user:pass string.
 */
function parseProxy(proxyStr) {
  try {
    if (proxyStr.includes('://')) {
      var parsed = new URL(proxyStr);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port) || 1080,
        username: parsed.username ? decodeURIComponent(parsed.username) : null,
        password: parsed.password ? decodeURIComponent(parsed.password) : null,
        protocol: parsed.protocol.replace(':', '').toLowerCase(),
      };
    }
    // host:port:user:pass format
    var parts = proxyStr.split(':');
    return {
      host: parts[0],
      port: parseInt(parts[1]) || 1080,
      username: parts[2] || null,
      password: parts[3] || null,
      protocol: 'unknown',
    };
  } catch (_) {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testproxy')
    .setDescription('Tests if proxies work by connecting to a cracked Minecraft server')
    .addIntegerOption((option) =>
      option
        .setName('index')
        .setDescription('Proxy index to test (1-based), or leave empty to test all')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const proxies = botManager.proxies;
    if (proxies.length === 0) {
      return interaction.editReply({ content: '❌ No proxies loaded. Add proxies to `proxies.txt` first.' });
    }

    const proxyIndex = interaction.options.getInteger('index');
    let toTest = [];

    if (proxyIndex !== null) {
      if (proxyIndex < 1 || proxyIndex > proxies.length) {
        return interaction.editReply({ content: `❌ Invalid index. You have ${proxies.length} proxies (1-${proxies.length}).` });
      }
      toTest.push({ index: proxyIndex, url: proxies[proxyIndex - 1] });
    } else {
      for (let i = 0; i < proxies.length; i++) {
        toTest.push({ index: i + 1, url: proxies[i] });
      }
    }

    // Pick a random test server
    const testServer = TEST_SERVERS[Math.floor(Math.random() * TEST_SERVERS.length)];

    let results = [];
    await interaction.editReply({ content: `⏳ Testing ${toTest.length} proxy(s) against \`${testServer.host}:${testServer.port}\`...\nTrying both SOCKS5 and HTTP CONNECT for each.` });

    for (const proxy of toTest) {
      const info = parseProxy(proxy.url);
      if (!info) {
        results.push({ index: proxy.index, display: proxy.url.substring(0, 30), socks5: '❌ Parse error', http: '❌ Parse error' });
        continue;
      }

      const displayUrl = info.host + ':' + info.port;
      let socks5Result = '⏳';
      let httpResult = '⏳';

      // Test SOCKS5
      try {
        await testSocks5(testServer.host, testServer.port, info.host, info.port, info.username, info.password);
        socks5Result = '✅ Working';
      } catch (err) {
        socks5Result = '❌ ' + (err.message || 'Failed').substring(0, 60);
      }

      // Test HTTP CONNECT
      try {
        await testHttpConnect(testServer.host, testServer.port, info.host, info.port, info.username, info.password);
        httpResult = '✅ Working';
      } catch (err) {
        httpResult = '❌ ' + (err.message || 'Failed').substring(0, 60);
      }

      results.push({ index: proxy.index, display: displayUrl, socks5: socks5Result, http: httpResult });

      // Update progress
      let progressMsg = `🔍 Testing against \`${testServer.host}:${testServer.port}\`\n\n`;
      for (const r of results) {
        progressMsg += `**#${r.index}** \`${r.display}\`\n`;
        progressMsg += `  SOCKS5: ${r.socks5}\n`;
        progressMsg += `  HTTP: ${r.http}\n`;
      }
      const remaining = toTest.length - results.length;
      if (remaining > 0) {
        progressMsg += `\n⏳ ${remaining} remaining...`;
      }
      if (progressMsg.length > 1900) progressMsg = progressMsg.substring(0, 1900) + '\n...';
      await interaction.editReply({ content: progressMsg }).catch(() => {});
    }

    // Final summary
    const socks5Working = results.filter(r => r.socks5.includes('✅')).length;
    const httpWorking = results.filter(r => r.http.includes('✅')).length;

    let finalMsg = `**Proxy Test Results** — \`${testServer.host}:${testServer.port}\`\n\n`;
    for (const r of results) {
      finalMsg += `**#${r.index}** \`${r.display}\`\n`;
      finalMsg += `  SOCKS5: ${r.socks5}\n`;
      finalMsg += `  HTTP: ${r.http}\n`;
    }
    finalMsg += `\n**Summary:** SOCKS5: ${socks5Working}/${results.length} ✅ | HTTP: ${httpWorking}/${results.length} ✅`;
    
    if (socks5Working > 0 && httpWorking === 0) {
      finalMsg += `\n💡 **Tip:** Use \`socks5://\` format in proxies.txt for best results.`;
    } else if (httpWorking > 0 && socks5Working === 0) {
      finalMsg += `\n💡 **Tip:** Use \`http://\` format in proxies.txt for best results.`;
    }

    if (finalMsg.length > 1900) finalMsg = finalMsg.substring(0, 1900) + '\n...';
    return interaction.editReply({ content: finalMsg });
  },
};
