// Simple one-terminal launcher for server + client watcher
// - Starts the Node server
// - Watches /public for changes and logs them as "client" events

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';

function prefixPipe(child, label) {
  const prefix = `[${label}]`;
  const pipe = (stream, isErr = false) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const out = `${prefix} ${line}`;
        if (isErr) process.stderr.write(out + '\n');
        else process.stdout.write(out + '\n');
      }
    });
    stream.on('end', () => {
      if (buf.length) {
        const out = `${prefix} ${buf}`;
        if (isErr) process.stderr.write(out + '\n');
        else process.stdout.write(out + '\n');
      }
    });
  };
  if (child.stdout) pipe(child.stdout, false);
  if (child.stderr) pipe(child.stderr, true);
}

function runServer() {
  const child = spawn(process.execPath, ['src/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  prefixPipe(child, 'server');
  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[server] exited with ${reason}`);
    process.exitCode = code ?? 0;
  });
  return child;
}

function watchClient() {
  const dir = resolve('public');
  console.log(`[client] watching ${dir}`);
  try {
    // Recursive watch: Windows/macOS true; Linux depends on fs
    const w = watch(dir, { recursive: true }, (event, filename) => {
      const file = filename ? filename.toString() : '';
      console.log(`[client] ${event}${file ? `: ${file}` : ''}`);
    });
    return w;
  } catch (err) {
    console.log(`[client] watch unavailable: ${String(err)}`);
    return null;
  }
}

console.log('[dev] starting server and client (same terminal logs)');
const server = runServer();
const watcher = watchClient();

function shutdown() {
  console.log('\n[dev] shutting down...');
  try { watcher && watcher.close && watcher.close(); } catch {}
  if (server && !server.killed) {
    server.kill('SIGINT');
    setTimeout(() => { try { server.kill('SIGKILL'); } catch {} }, 1500);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

