const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Undo the previous replace
html = html.replace('<link rel="stylesheet" href="premium_style.css', '<link rel="stylesheet" href="style.css');

// Add premium style after style.css
html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n  <link rel="stylesheet" href="premium_style.css?v=2">');
// Deal with potential query params
html = html.replace(/<link rel="stylesheet" href="style\.css\?[^"]+">/, '$&\n  <link rel="stylesheet" href="premium_style.css?v=2">');

fs.writeFileSync('index.html', html);
console.log('Linked both CSS files');
