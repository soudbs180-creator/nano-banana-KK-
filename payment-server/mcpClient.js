const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const EventSource = require('eventsource');

global.EventSource = EventSource;

let mcpClient = null;

function resolveMcpUrl() {
  const url =
    process.env.ALIPAY_MCP_URL ||
    process.env.AP_MCP_URL ||
    process.env.MCP_SERVER_ALIPAY_URL ||
    '';
  return String(url).trim();
}

function createTransport(url) {
  const normalized = String(url).trim();
  if (!normalized) {
    throw new Error('未配置 ALIPAY_MCP_URL（或 AP_MCP_URL / MCP_SERVER_ALIPAY_URL）');
  }

  const parsed = new URL(normalized);
  if (parsed.pathname.endsWith('/sse')) {
    return new SSEClientTransport(parsed);
  }
  return new StreamableHTTPClientTransport(parsed);
}

async function getMcpClient() {
  if (mcpClient) return mcpClient;

  const transport = createTransport(resolveMcpUrl());
  const client = new Client({ name: 'kk-studio-payment', version: '1.3.6' }, { capabilities: {} });
  await client.connect(transport);

  mcpClient = client;
  console.log('[MCP] Connected to alipay mcp server');
  return client;
}

module.exports = { getMcpClient };
