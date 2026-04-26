const fs = require('fs');
const { SocksClient } = require('socks');

const PROXIES_FILE = 'proxies.txt';
const TARGET_HOST = 'donutsmp.net';
const TARGET_PORT = 25565;
const TIMEOUT_MS = 5000;
const CONCURRENCY = 100; // Check 100 proxies at a time

async function checkProxy(proxyUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(proxyUrl);
      const options = {
        proxy: {
          host: parsed.hostname,
          port: parseInt(parsed.port),
          type: parsed.protocol === 'socks5:' ? 5 : 4
        },
        command: 'connect',
        destination: { host: TARGET_HOST, port: TARGET_PORT },
        timeout: TIMEOUT_MS
      };

      SocksClient.createConnection(options, (err, info) => {
        if (err) {
          resolve(null);
        } else {
          info.socket.destroy();
          resolve(proxyUrl);
        }
      });
    } catch (err) {
      resolve(null);
    }
  });
}

async function run() {
  if (!fs.existsSync(PROXIES_FILE)) {
    console.error(`❌ File ${PROXIES_FILE} not found. Please run update-proxies.js first.`);
    return;
  }

  const allProxies = fs.readFileSync(PROXIES_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  console.log(`Starting proxy filter against ${TARGET_HOST}:${TARGET_PORT}...`);
  console.log(`Total proxies to check: ${allProxies.length}`);
  
  const workingProxies = [];
  let checked = 0;

  for (let i = 0; i < allProxies.length; i += CONCURRENCY) {
    const batch = allProxies.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(p => checkProxy(p)));
    
    for (const res of results) {
      if (res) workingProxies.push(res);
    }
    
    checked += batch.length;
    process.stdout.write(`\r[${checked}/${allProxies.length}] Found working: ${workingProxies.length} `);
  }

  console.log('\n\n✅ Filter complete!');
  if (workingProxies.length > 0) {
    fs.writeFileSync(PROXIES_FILE, workingProxies.join('\n') + '\n', 'utf8');
    console.log(`Overwrote ${PROXIES_FILE} with the ${workingProxies.length} working proxies.`);
  } else {
    console.log('⚠️ No working proxies found. Did not overwrite the file. You may need to run update-proxies.js again later.');
  }
}

run();
