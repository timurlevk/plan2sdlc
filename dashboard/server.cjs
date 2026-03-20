// Prevent launching inside Claude Code session
if (process.env.CLAUDECODE) {
  console.error('Error: Dashboard cannot be launched inside a Claude Code session.');
  console.error('Open a separate terminal and run:');
  console.error('  node dashboard/server.cjs');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// Try to load node-pty, gracefully degrade if not available
let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('node-pty not available, terminal will be disabled');
}

// Try chokidar
let chokidar;
try {
  chokidar = require('chokidar');
} catch (e) {
  console.warn('chokidar not available, file watching disabled');
}

const PORT = process.env.SDLC_DASHBOARD_PORT || 3456;
const PROJECT_DIR = process.argv[2] || process.cwd();
const SDLC_DIR = path.join(PROJECT_DIR, '.sdlc');

console.log(`Project: ${PROJECT_DIR}`);
console.log(`SDLC dir: ${SDLC_DIR}`);

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: get current state
app.get('/api/state', (req, res) => {
  try {
    const state = {};
    const backlogPath = path.join(SDLC_DIR, 'backlog.json');
    const statePath = path.join(SDLC_DIR, 'state.json');
    const configPath = path.join(SDLC_DIR, 'config.yaml');

    if (fs.existsSync(backlogPath)) {
      state.backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    }
    if (fs.existsSync(statePath)) {
      state.workflow = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
    // Read registry for agent list
    const registryPath = path.join(SDLC_DIR, 'registry.yaml');
    if (fs.existsSync(registryPath)) {
      state.registry = fs.readFileSync(registryPath, 'utf8');
    }
    state.initialized = fs.existsSync(configPath);

    res.json(state);
  } catch (err) {
    res.json({ error: err.message, initialized: false });
  }
});

// WebSocket for terminal
const wssTerminal = new WebSocket.Server({ noServer: true });
// WebSocket for state updates
const wssState = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/ws/terminal') {
    wssTerminal.handleUpgrade(request, socket, head, (ws) => {
      wssTerminal.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/state') {
    wssState.handleUpgrade(request, socket, head, (ws) => {
      wssState.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Terminal WebSocket — spawns claude CLI
wssTerminal.on('connection', (ws) => {
  if (!pty) {
    ws.send(JSON.stringify({ type: 'output', data: 'Terminal not available (node-pty not installed)\r\n' }));
    return;
  }

  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  const args = process.platform === 'win32'
    ? ['/c', 'claude', '--agent', 'claude-sdlc:orchestrator', '--dangerously-skip-permissions']
    : ['-c', 'claude --agent claude-sdlc:orchestrator --dangerously-skip-permissions'];

  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: PROJECT_DIR,
    env: process.env,
  });

  ptyProcess.onData((data) => {
    try {
      ws.send(JSON.stringify({ type: 'output', data }));
    } catch (e) { /* client disconnected */ }
  });

  ptyProcess.onExit(({ exitCode }) => {
    try {
      ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    } catch (e) { /* client disconnected */ }
  });

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'input') {
        ptyProcess.write(parsed.data);
      } else if (parsed.type === 'resize') {
        ptyProcess.resize(parsed.cols, parsed.rows);
      }
    } catch (e) { /* ignore malformed messages */ }
  });

  ws.on('close', () => {
    ptyProcess.kill();
  });
});

// State WebSocket — file watcher pushes updates
const stateClients = new Set();
wssState.on('connection', (ws) => {
  stateClients.add(ws);
  ws.on('close', () => stateClients.delete(ws));
});

function broadcastState() {
  try {
    const state = {};
    const backlogPath = path.join(SDLC_DIR, 'backlog.json');
    const statePath = path.join(SDLC_DIR, 'state.json');

    if (fs.existsSync(backlogPath)) {
      state.backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    }
    if (fs.existsSync(statePath)) {
      state.workflow = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
    const registryPath = path.join(SDLC_DIR, 'registry.yaml');
    if (fs.existsSync(registryPath)) {
      state.registry = fs.readFileSync(registryPath, 'utf8');
    }

    const msg = JSON.stringify({ type: 'state', data: state });
    for (const client of stateClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  } catch (e) { /* ignore broadcast errors */ }
}

// Watch .sdlc/ for changes
if (chokidar && fs.existsSync(SDLC_DIR)) {
  const watcher = chokidar.watch(SDLC_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });
  watcher.on('change', broadcastState);
  watcher.on('add', broadcastState);
}

server.listen(PORT, () => {
  console.log(`SDLC Dashboard running at http://localhost:${PORT}`);
  // Auto-open browser
  const open = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`${open} http://localhost:${PORT}`);
});
