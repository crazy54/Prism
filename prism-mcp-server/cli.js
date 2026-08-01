#!/usr/bin/env node
// prism-mcp CLI.
//
//   prism-mcp start [--catalog <path>] [--no-watch] [--log-level <level>]
//   prism-mcp info  [--catalog <path>]     # print catalog stats and exit
//   prism-mcp tools                         # list tool names + descriptions and exit
//
// `start` runs the MCP server over stdio (for Claude Desktop / Anthropic API).
// Default catalog path resolves to ../Prism.html (the authoritative island),
// falling back to ../catalog/manifest.json.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismMCPServer, StdioTransport } from './index.js';
import { createLogger } from './utils/logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-watch') args.watch = false;
    else if (a === '--watch') args.watch = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

function resolveCatalog(explicit) {
  if (explicit) return path.resolve(explicit);
  const html = path.resolve(HERE, '..', 'Prism.html');
  if (fs.existsSync(html)) return html;
  const manifest = path.resolve(HERE, '..', 'catalog', 'manifest.json');
  return manifest;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args._[0] || 'start';
  const catalogPath = resolveCatalog(args.catalog);
  const logger = createLogger(args['log-level']);

  if (cmd === 'help' || args.help) {
    printHelp();
    return;
  }

  if (cmd === 'tools') {
    // Build a throwaway server just to enumerate tools (no catalog needed).
    const server = new PrismMCPServer(catalogPath, { watch: false, logger });
    for (const t of server.tools) {
      process.stdout.write(`${t.name}\n  ${t.description}\n\n`);
    }
    return;
  }

  if (cmd === 'info') {
    const server = new PrismMCPServer(catalogPath, { watch: false, logger });
    await server.load();
    const stats = await server.toolMap.get('get_catalog_stats').handler({}, { store: server.store, logger });
    const meta = server.store.meta();
    process.stdout.write(JSON.stringify({ meta, stats }, null, 2) + '\n');
    server.close();
    return;
  }

  if (cmd === 'start') {
    if (args.port) {
      logger.warn(`--port ${args.port} noted, but this build speaks MCP over stdio (Claude Desktop / Anthropic API launch it as a stdio subprocess). Ignoring --port.`);
    }
    const server = new PrismMCPServer(catalogPath, { watch: args.watch !== false, logger });
    await server.load();
    server.connect(new StdioTransport());
    // Keep the process alive; stdio transport drives everything.
    const shutdown = () => { logger.info('Shutting down'); server.close(); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  logger.error(`Unknown command "${cmd}"`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`prism-mcp — Prism catalog MCP server

Usage:
  prism-mcp start [options]     Run the MCP server over stdio (default)
  prism-mcp info  [options]     Print catalog metadata + stats, then exit
  prism-mcp tools               List available tools, then exit
  prism-mcp help                Show this help

Options:
  --catalog <path>   Path to Prism.html or catalog/manifest.json
                     (default: ../Prism.html, else ../catalog/manifest.json)
  --no-watch         Disable catalog hot reload
  --log-level <lvl>  debug | info | warn | error | silent  (default: info)

Examples:
  prism-mcp start --catalog ./Prism.html
  prism-mcp info --catalog ./catalog/manifest.json
`);
}

main().catch((err) => {
  process.stderr.write(`[prism-mcp fatal] ${err.stack || err.message}\n`);
  process.exit(1);
});
