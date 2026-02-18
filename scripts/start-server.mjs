#!/usr/bin/env node
/**
 * Start static server and open the app in the browser so you don't see "Index of".
 * Run: npm start
 * Serves index.html at / and SPA fallback for direct links.
 */
import { spawn } from 'child_process';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const port = 3000;
const url = `http://localhost:${port}/`;

const child = spawn('npx', ['serve', root, '-l', String(port), '-s'], {
  stdio: 'inherit',
  cwd: root
});

child.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Open browser after server is ready
setTimeout(() => {
  const opener = platform() === 'win32' ? 'start' : (platform() === 'darwin' ? 'open' : 'xdg-open');
  spawn(opener, [url], { stdio: 'ignore', shell: true }).on('error', () => {});
  console.log('\nApp URL: ' + url + '\n');
}, 2500);
