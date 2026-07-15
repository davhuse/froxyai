const fs = require('fs');

const filePath = 'server.js';
const backupPath = 'server.js.mojibak';

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(filePath, backupPath);
  console.log('Created server.js backup.');
}

let content = fs.readFileSync(filePath, 'utf8');

const replacements = {
  'Ã§': 'ç', 'Ã¼': 'ü', 'Ã¶': 'ö', 'Ã‡': 'Ç', 'Ã–': 'Ö', 'Ãœ': 'Ü',
  'ÅŸ': 'ş', 'Åž': 'Ş', 'Ä±': 'ı', 'Ä°': 'İ', 'ÄŸ': 'ğ', 'Äž': 'Ğ'
};

let count = 0;
for (const [mojibake, correct] of Object.entries(replacements)) {
  let index = 0;
  while ((index = content.indexOf(mojibake, index)) !== -1) {
    count++;
    index += mojibake.length;
  }
  content = content.split(mojibake).join(correct);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Finished. Replaced ${count} mojibake sequences in server.js.`);
