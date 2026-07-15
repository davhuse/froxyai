const fs = require('fs');
const path = require('path');
const folders = ['.', 'backups/backup_20260606_1417'];
const files = ['app.js', 'server.js', 'index.html', 'froxy-robot.js', 'froxy-robot.css'];
const markers = {
  'Ã§': 'ç', 'Ã¼': 'ü', 'Ã¶': 'ö', 'Ã‡': 'Ç', 'Ã–': 'Ö', 'Ãœ': 'Ü',
  'ÅŸ': 'ş', 'Åž': 'Ş', 'Ä±': 'ı', 'Ä°': 'İ', 'ÄŸ': 'ğ', 'Äž': 'Ğ'
};
for (const dir of folders) {
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    const counts = {};
    let total = 0;
    for (const [m, r] of Object.entries(markers)) {
      let c = 0;
      let idx = 0;
      while ((idx = raw.indexOf(m, idx)) !== -1) {
        c++;
        idx += m.length;
      }
      if (c) { counts[m] = c; total += c; }
    }
    console.log(`${p}: total=${total}`, total ? JSON.stringify(counts) : '');
  }
}
