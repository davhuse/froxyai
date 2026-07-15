// SSH client using Node.js ssh2 module
// Connects to Hostinger and restarts Node.js app

const { Client } = require('ssh2');

const conn = new Client();

const commands = [
  'cd ~/public_html && echo "=== PWD ===" && pwd',
  'ls -la ~/public_html/ | head -30',
  'echo "=== Node version ===" && node --version',
  'echo "=== NPM install ===" && cd ~/public_html && npm install --omit=dev --prefer-offline 2>&1 | tail -5',
  'echo "=== Checking running processes ===" && ps aux | grep node | grep -v grep',
  'echo "=== Kill old node ===" && pkill -f "node server.js" 2>/dev/null; sleep 1; echo killed',
  'echo "=== Starting server ===" && cd ~/public_html && nohup node server.js > logs/app.log 2>&1 & echo "PID: $!"',
  'sleep 2 && ps aux | grep "node server" | grep -v grep',
].join(' && ');

conn.on('ready', () => {
  console.log('✅ SSH Connected!');
  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('❌ Exec error:', err);
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      console.log('\n✅ Done, exit code:', code);
      conn.end();
    });
    stream.stdout.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write('STDERR: ' + d.toString()));
  });
}).on('error', (err) => {
  console.error('❌ Connection error:', err.message);
}).connect({
  host: '82.198.229.19',
  port: 65002,
  username: 'u334437078',
  password: 'Efebey06.',
  readyTimeout: 20000,
});
