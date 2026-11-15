/** One-shot Live AI smoke test (reads .env via server helpers). */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const root = path.join(__dirname, '..');
const port = 43731;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        timeout: 120000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, text });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: root,
    env: { ...process.env, CREW_SWAP_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let boot = '';
  child.stdout.on('data', (d) => {
    boot += d.toString();
    process.stdout.write(d);
  });
  child.stderr.on('data', (d) => process.stderr.write(d));

  for (let i = 0; i < 40; i += 1) {
    if (boot.includes('Crew Swap server ready')) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  try {
    const status = await request('GET', '/api/chat');
    console.log('STATUS', status.status, status.text);
    const chat = await request('POST', '/api/chat', {
      message: 'Say OK in one word.',
      stream: false,
      history: [],
      context: { view: 'overview', crew: [] }
    });
    console.log('CHAT', chat.status, chat.text.slice(0, 500));
    process.exitCode = chat.status === 200 ? 0 : 1;
  } catch (error) {
    console.error('TEST_FAIL', error.message);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

main();
