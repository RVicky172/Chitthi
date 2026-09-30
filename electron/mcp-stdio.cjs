/*
 * The stdio side of `Chitthi --mcp`. Electron's main process can't read stdin on Windows (it sees end-of-input at
 * once), so the main process starts this script with Electron's own binary in Node mode (ELECTRON_RUN_AS_NODE=1). It
 * inherits the real stdin/stdout from the MCP client and relays each newline-delimited JSON-RPC message to the MCP
 * server the main process runs on 127.0.0.1 (Streamable HTTP, JSON responses, bearer token), writing the replies back.
 * No dependencies, so it runs outside the app archive (electron-builder unpacks it).
 */
const URL_ = process.env.CHITTHI_MCP_URL;
const TOKEN = process.env.CHITTHI_MCP_TOKEN;

if (!URL_ || !TOKEN) {
  process.stderr.write('Chitthi MCP relay: missing server address.\n');
  process.exit(2);
}

let buf = '';
let chain = Promise.resolve();

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function relay(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(msg),
    });
    if (res.status === 202 || res.status === 204) return; // a notification: nothing to send back
    const text = await res.text();
    if (!text) return;
    const type = res.headers.get('content-type') || '';
    const out = type.includes('text/event-stream')
      ? text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => JSON.parse(l.slice(5).trim()))
      : [JSON.parse(text)];
    for (const o of out.flat()) write(o);
  } catch (e) {
    if (msg && msg.id !== undefined) write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `Chitthi isn’t answering: ${e && e.message ? e.message : e}` } });
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    // One message at a time, in order: MCP clients expect replies to follow their requests.
    if (line) chain = chain.then(() => relay(line));
  }
});
process.stdin.on('end', () => chain.then(() => process.exit(0)));
