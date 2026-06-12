#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('🔍 Starting configuration check...');

// ngrokの現在のURLを取得
async function getCurrentNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const tunnels = JSON.parse(data);
          const tunnel = tunnels.tunnels.find(t => t.proto === 'https');
          resolve(tunnel ? tunnel.public_url : null);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout connecting to ngrok'));
    });
  });
}

// .envファイルを読み込み・更新
function updateEnvFile(currentUrl) {
  const envPath = path.join(__dirname, '../backend/.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    return false;
  }

  let content = fs.readFileSync(envPath, 'utf8');
  
  // 現在の設定を確認
  const ngrokUrlMatch = content.match(/NGROK_URL=(.+)/);
  const baseUrlMatch = content.match(/BASE_URL=(.+)/);
  
  const currentNgrokUrl = ngrokUrlMatch ? ngrokUrlMatch[1] : null;
  const currentBaseUrl = baseUrlMatch ? baseUrlMatch[1] : null;
  
  console.log('📋 Current configuration:');
  console.log(`   NGROK_URL: ${currentNgrokUrl || 'Not set'}`);
  console.log(`   BASE_URL: ${currentBaseUrl || 'Not set'}`);
  console.log(`   Detected ngrok URL: ${currentUrl || 'Not detected'}`);

  if (!currentUrl) {
    console.log('⚠️  ngrok not running or not accessible');
    return false;
  }

  if (currentNgrokUrl === currentUrl && currentBaseUrl === currentUrl) {
    console.log('✅ URLs are already up to date');
    return false;
  }

  // URLを更新
  content = content.replace(/NGROK_URL=.+/, `NGROK_URL=${currentUrl}`);
  content = content.replace(/BASE_URL=.+/, `BASE_URL=${currentUrl}`);

  fs.writeFileSync(envPath, content);
  
  console.log('✅ Updated .env file with new ngrok URL');
  console.log(`   New URL: ${currentUrl}`);
  return true;
}

// サーバーステータスをチェック
function checkServerStatus() {
  console.log('\n🔍 Checking server status:');
  
  const processes = require('child_process').execSync('ps aux | grep -E "(npm start|node server|ngrok)" | grep -v grep', { encoding: 'utf8' }).trim();
  
  if (processes) {
    console.log('📊 Running processes:');
    processes.split('\n').forEach(line => {
      const parts = line.split(/\s+/);
      const pid = parts[1];
      const command = parts.slice(10).join(' ');
      console.log(`   PID ${pid}: ${command}`);
    });
  } else {
    console.log('⚠️  No relevant processes found');
  }
}

// メイン実行
async function main() {
  try {
    checkServerStatus();
    
    console.log('\n🔍 Checking ngrok configuration...');
    
    const currentUrl = await getCurrentNgrokUrl();
    const updated = updateEnvFile(currentUrl);
    
    if (updated) {
      console.log('\n⚠️  Configuration updated! Backend server needs restart.');
      console.log('   Run: npm run restart-backend');
    }
    
    console.log('\n✅ Configuration check completed');
    
  } catch (error) {
    console.error('❌ Error during configuration check:', error.message);
    process.exit(1);
  }
}

main();