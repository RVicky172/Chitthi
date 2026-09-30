import { desktop } from '../platform/desktop';
import { PROMPTS, RESOURCES } from './prompts';
import { ToolError, TOOLS, TOOLS_BY_NAME, type AgentEnv } from './tools';

/*
 * Connects the agent tools to the desktop main process (electron/mcp.cjs). The main process forwards each MCP
 * request as an 'agent:call' {id, name, args}; this answers with desktop.agent.reply(id, result). Special names:
 * __list (tools, resources, prompts), __resource, __prompt. Calls run one at a time so an agent's parallel calls
 * can't interleave design edits. Loaded only in the desktop app: at start-up for headless MCP (?agent), or when the
 * user turns on "Let an agent work in this open window".
 */

export interface WireResult {
  ok: boolean;
  text?: string;
  json?: unknown;
  image?: { data: string; mimeType: string };
  paths?: string[];
  error?: string;
}

const b64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const env: AgentEnv = { readPhoto: desktop?.agent ? (p) => desktop!.agent!.readPhoto(p) : undefined };

async function handle(name: string, args: Record<string, unknown>): Promise<WireResult | unknown> {
  if (name === '__list')
    return {
      tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: !!t.readOnly, destructive: !!t.destructive })),
      resources: RESOURCES.map(({ uri, name: n, description, mimeType }) => ({ uri, name: n, description, mimeType })),
      prompts: PROMPTS.map(({ name: n, title, description, arguments: a }) => ({ name: n, title, description, arguments: a })),
    };
  if (name === '__resource') {
    const r = RESOURCES.find((x) => x.uri === args.uri);
    if (!r) throw new ToolError(`Unknown resource ${String(args.uri)}`);
    return { uri: r.uri, mimeType: r.mimeType, text: await r.read() };
  }
  if (name === '__prompt') {
    const p = PROMPTS.find((x) => x.name === args.name);
    if (!p) throw new ToolError(`Unknown prompt ${String(args.name)}`);
    return { description: p.description, text: p.build((args.arguments as Record<string, string>) ?? {}) };
  }
  const tool = TOOLS_BY_NAME[name];
  if (!tool) throw new ToolError(`Unknown tool ${name}`);
  const r = await tool.run(args ?? {}, env);
  const out: WireResult = { ok: true, text: r.text, json: r.json };
  if (r.image) out.image = { data: await b64(r.image), mimeType: r.image.type || 'image/png' };
  if (r.files?.length && desktop?.agent) out.paths = await desktop.agent.writeFiles(await Promise.all(r.files.map(async (f) => ({ name: f.name, data: await f.blob.arrayBuffer() }))));
  return out;
}

let queue: Promise<unknown> = Promise.resolve();
let installed = false;

export function installAgentBridge(): void {
  if (installed || !desktop?.agent) return;
  installed = true;
  const agent = desktop.agent;
  agent.onCall(({ id, name, args }) => {
    queue = queue.then(async () => {
      try {
        agent.reply(id, await handle(name, (args as Record<string, unknown>) ?? {}));
      } catch (e) {
        agent.reply(id, { ok: false, error: e instanceof Error ? e.message : String(e) } satisfies WireResult);
      }
    });
  });
  // Tells the main process the tools are ready (headless start waits for this).
  agent.reply(0, { ready: true });
}

installAgentBridge();
