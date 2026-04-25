/**
 * Proxy test — join _Utsab.aternos.me:26403 through SOCKS5 proxy
 */
const mineflayer = require('mineflayer');
const { SocksClient } = require('socks');
const dns = require('dns');

const PROXY = { host: '31.59.20.176', port: 6754, user: 'hxxqstat', pass: 'i7j40in5yymr' };
const SERVER_HOST = '_Utsab.aternos.me';
const SERVER_PORT = 26403;
const USERNAME = 'TestBot_' + Math.floor(Math.random() * 9999);

console.log(`\nTarget: ${SERVER_HOST}:${SERVER_PORT}`);
console.log(`Proxy: SOCKS5 ${PROXY.host}:${PROXY.port}`);
console.log(`Username: ${USERNAME}\n`);

async function run() {
  // Step 0: Resolve DNS locally first (proxy might not handle DNS well)
  console.log('[0] Resolving DNS for ' + SERVER_HOST + '...');
  let resolvedIP;
  try {
    const addresses = await dns.promises.resolve4(SERVER_HOST);
    resolvedIP = addresses[0];
    console.log('[0] ✅ Resolved to ' + resolvedIP + '\n');
  } catch (err) {
    console.log('[0] ⚠️ DNS failed (' + err.message + '), using hostname directly.\n');
    resolvedIP = SERVER_HOST;
  }

  // Step 1: SOCKS5 tunnel
  console.log('[1] Creating SOCKS5 tunnel to ' + resolvedIP + ':' + SERVER_PORT + '...');
  let proxySocket;
  try {
    const info = await SocksClient.createConnection({
      proxy: { host: PROXY.host, port: PROXY.port, type: 5, userId: PROXY.user, password: PROXY.pass },
      command: 'connect',
      destination: { host: resolvedIP, port: SERVER_PORT },
      timeout: 20000,
    });
    proxySocket = info.socket;
    console.log('[1] ✅ SOCKS5 tunnel established!\n');
  } catch (err) {
    console.log('[1] ❌ SOCKS5 failed: ' + err.message);
    
    // Fallback: try without proxy (direct) to verify server is up
    console.log('\n[DIRECT] Trying direct connection (no proxy) to verify server is online...');
    try {
      const bot = mineflayer.createBot({
        host: SERVER_HOST,
        port: SERVER_PORT,
        username: USERNAME,
        auth: 'offline',
        version: false,
        hideErrors: false,
      });
      bot.once('login', () => { console.log('[DIRECT] ✅ Server IS online — direct login worked. Proxy is the problem.'); setTimeout(() => { bot.quit(); process.exit(0); }, 2000); });
      bot.once('kicked', (r) => { console.log('[DIRECT] Server is online (kicked: ' + JSON.stringify(r).substring(0,200) + ')'); process.exit(0); });
      bot.once('error', (e) => { console.log('[DIRECT] ❌ Server error: ' + e.message); process.exit(1); });
      bot.once('end', (r) => { console.log('[DIRECT] Disconnected: ' + r); process.exit(0); });
      setTimeout(() => { console.log('[DIRECT] Timeout'); process.exit(1); }, 20000);
    } catch (e2) {
      console.log('[DIRECT] ❌ ' + e2.message);
      process.exit(1);
    }
    return;
  }

  // Step 2: Mineflayer bot
  console.log('[2] Creating mineflayer bot...');
  const bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: USERNAME,
    auth: 'offline',
    version: false,
    hideErrors: false,
    connect: function(client) {
      client.setSocket(proxySocket);
      client.emit('connect');
    },
  });

  bot.once('login', function() {
    console.log('[3] ✅✅✅ LOGIN SUCCESS via proxy as ' + bot.username + ' ✅✅✅');
    setTimeout(() => { bot.quit('test done'); process.exit(0); }, 3000);
  });

  bot.once('spawn', function() {
    console.log('[4] ✅ Spawned into the world!');
  });

  bot.once('kicked', function(reason) {
    console.log('[3] Kicked: ' + JSON.stringify(reason).substring(0, 300));
    console.log('[3] ⚠️ Proxy works — server kicked us (normal for some servers).');
    process.exit(0);
  });

  bot.once('error', function(err) {
    console.log('[3] ❌ Error: ' + err.message);
  });

  bot.once('end', function(reason) {
    console.log('[3] Disconnected: ' + reason);
    process.exit(0);
  });

  setTimeout(() => {
    console.log('[TIMEOUT] 30s — killing.');
    try { bot.quit(); } catch(_) {}
    process.exit(1);
  }, 30000);
}

run();
