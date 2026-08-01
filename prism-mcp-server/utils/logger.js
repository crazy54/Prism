// Minimal logger. Writes to stderr so it never corrupts the stdio MCP JSON-RPC
// channel on stdout. Honors PRISM_MCP_LOG_LEVEL (debug|info|warn|error|silent).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export function createLogger(level = process.env.PRISM_MCP_LOG_LEVEL || 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, msg) => {
    if (LEVELS[lvl] < threshold) return;
    const line = `[prism-mcp ${lvl}] ${msg}`;
    process.stderr.write(line + '\n');
  };
  return {
    level,
    debug: (m) => write('debug', m),
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
  };
}
