const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'app.js');
const c = fs.readFileSync(FILE, 'utf8');
const lines = c.split('\n');

console.log('Total:', lines.length, 'lines,', (c.length/1024).toFixed(1), 'KB');

// Find all section comments
console.log('\n=== Section markers ===');
for(let i=0;i<lines.length;i++){
  if(/^\/\/\s*={3,}/.test(lines[i]) || /^\/\*\s*v\d+/.test(lines[i])){
    console.log('  Line '+(i+1)+': '+lines[i].trim().substring(0,100));
  }
}

// Count duplicate function definitions  
console.log('\n=== Still duplicated window.X functions ===');
const funcs = {};
for(let i=0;i<lines.length;i++){
  const m = lines[i].match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/);
  if(m){
    const name = 'window.' + m[1];
    if(!funcs[name]) funcs[name] = [];
    funcs[name].push(i+1);
  }
}
const dupes = Object.entries(funcs).filter(([n,ls])=>ls.length>1).sort((a,b)=>b[1].length-a[1].length);
console.log(dupes.length + ' duplicated functions:');
dupes.forEach(([name, ls]) => console.log('  ' + name + ': lines ' + ls.join(', ')));

// Look for big renderXXX function bodies to find redundancy
console.log('\n=== renderAIToolsHub definitions ===');
for(let i=0;i<lines.length;i++){
  if(lines[i].includes('renderAIToolsHub') && (lines[i].includes('function') || lines[i].includes('=function'))){
    console.log('  Line '+(i+1)+': '+lines[i].trim().substring(0,80));
  }
}

console.log('\n=== renderPrompts definitions ===');
for(let i=0;i<lines.length;i++){
  if(lines[i].includes('renderPrompts') && (lines[i].includes('function') || lines[i].includes('=function'))){
    console.log('  Line '+(i+1)+': '+lines[i].trim().substring(0,80));
  }
}
