// PrismMCPServer — a zero-dependency Model Context Protocol server exposing the
// Prism catalog. Implements the MCP JSON-RPC 2.0 surface (initialize, tools/list,
// tools/call, ping) over a stdio transport, which is what Claude Desktop and the
// Anthropic API mcp_servers (stdio) integration speak.
//
// Design notes:
//   - No SDK dependency: the protocol is small and this keeps install/runtime trivial
//     and offline (matching Prism's single-file ethos). Tool definitions are shaped
//     exactly like MCP tools so migrating to @modelcontextprotocol/sdk later is a lift,
//     not a rewrite.
//   - Transport is pluggable (StdioTransport here); a test harness can call
//     handleMessage() directly.

import { CatalogStore } from './utils/catalog.js';
import { buildTools, ToolError } from './tools/index.js';
import { createLogger } from './utils/logger.js';

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'prism-mcp-server';
export const SERVER_VERSION = '1.0.0';

export class PrismMCPServer {
  /**
   * @param {string} catalogPath  path to Prism.html (island) or catalog/manifest.json
   * @param {object} opts { watch, logger }
   */
  constructor(catalogPath, opts = {}) {
    if (!catalogPath) throw new Error('PrismMCPServer requires a catalogPath');
    this.logger = opts.logger || createLogger(opts.logLevel);
    this.store = new CatalogStore(catalogPath, { watch: opts.watch !== false, logger: this.logger });
    this.tools = buildTools();
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    this.initialized = false;
    this.requestCount = 0;
    this.store.on('reload', (stats) => this.logger.info(`Catalog reloaded: ${stats.effects} effects`));
  }

  async load() {
    await this.store.load();
    return this;
  }

  // ---- JSON-RPC dispatch ----
  async handleMessage(msg) {
    // Notifications (no id) get no response.
    const isNotification = msg.id === undefined || msg.id === null;
    try {
      const result = await this.dispatch(msg);
      if (isNotification) return null;
      return { jsonrpc: '2.0', id: msg.id, result };
    } catch (err) {
      if (isNotification) {
        this.logger.warn(`Notification handler error: ${err.message}`);
        return null;
      }
      return this.errorResponse(msg.id, err);
    }
  }

  async dispatch(msg) {
    const { method, params } = msg;
    switch (method) {
      case 'initialize':
        return this.onInitialize(params);
      case 'initialized':
      case 'notifications/initialized':
        this.initialized = true;
        return {};
      case 'ping':
        return {};
      case 'tools/list':
        return this.onToolsList();
      case 'tools/call':
        return this.onToolsCall(params);
      default:
        throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }

  onInitialize(params) {
    this.initialized = true;
    const clientProto = params && params.protocolVersion;
    this.logger.info(`initialize from client (protocol ${clientProto || 'unspecified'})`);
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: 'Prism catalog MCP. Use search_effects/list_effects to discover, get_effect for full html/css, compose/compose_with_template to build bundles, and create_facet/validate_facet to author new components.',
    };
  }

  onToolsList() {
    return {
      tools: this.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  async onToolsCall(params) {
    if (!params || typeof params.name !== 'string') {
      throw new RpcError(-32602, 'tools/call requires a "name"');
    }
    const tool = this.toolMap.get(params.name);
    if (!tool) {
      throw new RpcError(-32602, `Unknown tool: ${params.name}`, {
        availableTools: this.tools.map((t) => t.name),
      });
    }
    const args = params.arguments || {};
    const started = Date.now();
    this.requestCount++;
    this.logger.debug(`tools/call ${params.name} args=${safeJson(args)}`);
    try {
      const out = await tool.handler(args, { store: this.store, logger: this.logger });
      const ms = Date.now() - started;
      this.logger.info(`tool ${params.name} ok (${ms}ms)`);
      return {
        content: [{ type: 'text', text: safeJson(out) }],
        isError: false,
      };
    } catch (err) {
      const ms = Date.now() - started;
      // ToolError -> structured, actionable tool result (isError:true), NOT a protocol error.
      if (err instanceof ToolError) {
        this.logger.warn(`tool ${params.name} error (${ms}ms): ${err.message}`);
        return {
          content: [{ type: 'text', text: safeJson({ error: err.message, code: err.code, data: err.data }) }],
          isError: true,
        };
      }
      // Unexpected error: still return as tool error so the agent gets a message.
      this.logger.error(`tool ${params.name} threw: ${err.stack || err.message}`);
      return {
        content: [{ type: 'text', text: safeJson({ error: err.message, code: 'internal_error' }) }],
        isError: true,
      };
    }
  }

  errorResponse(id, err) {
    if (err instanceof RpcError) {
      return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } };
    }
    this.logger.error(`Internal error: ${err.stack || err.message}`);
    return { jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error', data: { detail: err.message } } };
  }

  /** Attach a transport (must expose onMessage(cb) and send(obj)). */
  connect(transport) {
    this.transport = transport;
    transport.onMessage(async (msg) => {
      const res = await this.handleMessage(msg);
      if (res) transport.send(res);
    });
    transport.start && transport.start();
    this.logger.info(`${SERVER_NAME} v${SERVER_VERSION} connected (${this.tools.length} tools)`);
    return this;
  }

  close() {
    this.store.close();
    this.transport && this.transport.stop && this.transport.stop();
  }
}

export class RpcError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function safeJson(v) {
  try { return JSON.stringify(v, null, 2); }
  catch (e) { return JSON.stringify({ error: 'unserializable result', detail: String(e) }); }
}

/**
 * Stdio transport: newline-delimited JSON-RPC on stdin/stdout. This is the
 * transport Claude Desktop launches (command + args) and the Anthropic API uses
 * for local stdio MCP servers.
 */
export class StdioTransport {
  constructor({ input = process.stdin, output = process.stdout } = {}) {
    this.input = input;
    this.output = output;
    this.buffer = '';
    this.cb = null;
  }
  onMessage(cb) { this.cb = cb; }
  start() {
    this.input.setEncoding('utf8');
    this.input.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); }
        catch (e) {
          this.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { detail: e.message } } });
          continue;
        }
        this.cb && this.cb(msg);
      }
    });
  }
  send(obj) { this.output.write(JSON.stringify(obj) + '\n'); }
  stop() { /* stdin close handled by process lifecycle */ }
}
