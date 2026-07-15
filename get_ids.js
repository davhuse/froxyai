const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const idRegex = /id="([^"]+)"/g;
let match;
const ids = new Set();
while ((match = idRegex.exec(html)) !== null) {
  ids.add(match[1]);
}
console.log([...ids].join(', '));
