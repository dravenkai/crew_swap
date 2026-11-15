const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = http.createServer((request, response) => {
  if (!/^127\.0\.0\.1:\d+$/.test(request.headers.host || '')) { response.writeHead(403).end(); return; }
  let url;
  try { url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end('Page not found'); return; }
    response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    response.end(content);
  });
});
server.listen(Number(process.env.CREW_SWAP_PORT || 43730), '127.0.0.1', () => console.log('Crew Swap server ready'));
