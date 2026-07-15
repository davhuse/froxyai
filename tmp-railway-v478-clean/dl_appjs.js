const ftp = require('basic-ftp');
const fs = require('fs');

async function run() {
  const c = new ftp.Client();
  c.ftp.verbose = false;
  await c.access({host:'82.198.229.19',port:21,user:'u334437078.darkseagreen-elephant-580796.hostingersite.com',password:'Efebey06.',secure:false});
  await c.cd('/public_html');
  
  // Download current app.js from server to inspect it
  await c.downloadTo('C:/Users/habil/.gemini/antigravity/scratch/LandingPage/app_server.js', 'app.js');
  console.log('Downloaded app.js from server');
  c.close();
}
run().catch(e=>console.error(e.message));
