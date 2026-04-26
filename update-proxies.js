const fs = require('fs');
const path = require('path');

async function updateProxies() {
  console.log('Fetching proxies from Proxifly...');
  try {
    const res = await fetch('https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const data = await res.json();
    
    // Filter for SOCKS4 and SOCKS5 proxies
    const socksProxies = data
      .filter(p => p.protocol === 'socks5' || p.protocol === 'socks4')
      .map(p => `${p.protocol}://${p.ip}:${p.port}`);
      
    if (socksProxies.length === 0) {
      console.log('No SOCKS proxies found in the list.');
      return;
    }

    const proxiesPath = path.join(__dirname, 'proxies.txt');
    fs.writeFileSync(proxiesPath, socksProxies.join('\n') + '\n', 'utf8');
    console.log(`✅ Successfully saved ${socksProxies.length} SOCKS proxies to proxies.txt`);
    
  } catch (err) {
    console.error('❌ Failed to update proxies:', err.message);
  }
}

updateProxies();
