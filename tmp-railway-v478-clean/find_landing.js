const fs = require('fs');
const h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');

// Find v-landing using different quote styles
let start = h.indexOf('id="v-landing"');
if (start === -1) start = h.indexOf("id='v-landing'");
if (start === -1) start = h.indexOf('id=v-landing');
console.log('v-landing at:', start);

// Search around that area
if (start > -1) {
  console.log('Context:', h.substring(start - 30, start + 50));
}

// Find v-chat
let chatStart = h.indexOf('id="v-chat"');
if (chatStart === -1) chatStart = h.indexOf("id='v-chat'");
if (chatStart === -1) chatStart = h.indexOf('id=v-chat');
console.log('v-chat at:', chatStart);

// Try finding by class
console.log('hero class at:', h.indexOf('class="hero"'));
console.log('landing-chatbot at:', h.indexOf('landing-chatbot'));
console.log('footer at:', h.indexOf('class="footer"'));

// Find the div that contains everything
const bodyStart = h.indexOf('<body');
const bodyContent = h.substring(bodyStart, bodyStart + 300);
console.log('\nBody start:', bodyContent);
