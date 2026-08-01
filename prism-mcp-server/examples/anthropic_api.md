# Using the Prism MCP server from the Anthropic API

The Messages API can launch a local (stdio) MCP server as a subprocess via the
`mcp_servers` parameter, then let Claude call its tools during a turn. This
document shows two ways to wire it up.

> The Prism server speaks MCP over **stdio** — the same transport Claude Desktop
> uses. It is launched with `node cli.js start --catalog <path>`.

---

## 1. `mcp_servers` request parameter (stdio)

```jsonc
// POST https://api.anthropic.com/v1/messages
{
  "model": "claude-opus-4-8",
  "max_tokens": 2048,
  "mcp_servers": [
    {
      "type": "stdio",
      "name": "prism",
      "command": "node",
      "args": [
        "/abs/path/prism-mcp-server/cli.js",
        "start",
        "--catalog",
        "/abs/path/Prism.html"
      ]
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Find a pulsing KPI card and a wind background, then compose them into one bundle I can paste into a page."
    }
  ]
}
```

Claude will call, e.g., `search_effects` → `search_effects` → `compose`, and
return the merged HTML/CSS.

---

## 2. Tool Runner (SDK, runs the agentic loop for you)

The Anthropic SDK's Tool Runner drives the tool-use loop. Here we bridge each
Prism tool as a local tool by shelling into the same server over stdio. The
simplest robust bridge is to import the server's tool registry directly (it is
zero-dependency ESM) rather than spawning a subprocess:

```js
// bridge.mjs — expose Prism tools to the Anthropic SDK Tool Runner
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from '../utils/catalog.js';
import { buildTools, ToolError } from '../tools/index.js';
import { createLogger } from '../utils/logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(HERE, '..', '..', 'Prism.html');

// Load the catalog once and reuse it across tool calls.
const logger = createLogger('warn');
const store = new CatalogStore(CATALOG, { watch: false, logger });
await store.load();
const ctx = { store, logger };

// Map Prism tool defs -> SDK tool defs with an execute() that calls the handler.
const prismTools = buildTools().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
  run: async (args) => {
    try {
      return JSON.stringify(t.handler(args, ctx));
    } catch (e) {
      if (e instanceof ToolError) {
        return JSON.stringify({ error: e.message, code: e.code, data: e.data });
      }
      throw e;
    }
  },
}));

const client = new Anthropic();

const runner = client.beta.messages.toolRunner({
  model: 'claude-opus-4-8',
  max_tokens: 2048,
  tools: prismTools,
  messages: [
    {
      role: 'user',
      content:
        'Search for a pulsing KPI card, then compose it with a wind background as a full-page bundle.',
    },
  ],
});

for await (const message of runner) {
  for (const block of message.content) {
    if (block.type === 'text') process.stdout.write(block.text);
  }
}
```

Run it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node examples/bridge.mjs
```

This keeps a single warm `CatalogStore` in memory (fast, hot-reloadable) while
Claude iterates over the 15 tools.
