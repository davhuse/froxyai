const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

async function downloadFromFTP() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: '82.198.229.19',
      port: 21,
      user: 'u334437078.darkseagreen-elephant-580796.hostingersite.com',
      password: 'Efebey06.',
      secure: false
    });
    console.log('Connected!');
    const list = await client.list('/public_html');
    console.log('Files:', list.map(f => f.name).join(', '));
    
    // Download main HTML files
    const targetDir = 'C:/Users/habil/.gemini/antigravity/scratch/LandingPage';
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    
    for (const f of list) {
      if (f.name.match(/\.(html|css|js|json)$/i) && f.type === 1) {
        console.log('Downloading:', f.name);
        await client.downloadTo(path.join(targetDir, f.name), '/public_html/' + f.name);
      }
    }
    console.log('Done!');
  } catch(e) {
    console.error('Error:', e.message);
  }
  client.close();
}

downloadFromFTP();
