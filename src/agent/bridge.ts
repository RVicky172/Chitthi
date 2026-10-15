import { isRecord } from '../engine/guards';
import { desktop } from '../platform/desktop';
import { PROMPTS, RESOURCES } from './prompts';
import { toolNamed, ToolError, TOOLS, type AgentEnv } from './tools';

/*
 * Connects the agent tools to the desktop main process (electron/mcp.cjs). The main process forwards each MCP
 * request as an 'agent:call' {id, name, args}; this answers with desktop.agent.reply(id, result). Special names:
 * __list (tools, resources, prompts), __resource, __prompt. Calls run one at a time so an agent's parallel calls
 * can't interleave design edits. Loaded only in the desktop app: at start-up for headless MCP (?agent), or when the
 * user turns on "Let an agent work in this open window".
 */

/** A tool's answer as it goes back over IPC. */
export interface WireResult {
  ok: boolean;
  text?: string;
  json?: unknown;
  image?: { data: string; mimeType: string };
  /** Where the desktop app wrote the tool's files. */
  paths?: string[];
  error?: string;
}

/**
 * A file's bytes as base64.
 * @param blob the file
 * @returns its base64 text
 */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

const agentBridge = desktop?.agent;
const env: AgentEnv = { readPhoto: agentBridge ? (path) => agentBridge.readPhoto(path) : undefined };

/**
 * The tools, resources and prompts an agent can use.
 * @returns their public descriptions
 */
const catalogue = () => ({
  tools: TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    readOnly: !!tool.readOnly,
    destructive: !!tool.destructive,
  })),
  resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })),
  prompts: PROMPTS.map(({ name, title, description, arguments: promptArgs }) => ({ name, title, description, arguments: promptArgs })),
});

/**
 * The text arguments of a prompt request.
 * @param given the request's `arguments`
 * @returns the arguments that are text
 */
function promptArgsOf(given: unknown): Partial<Record<string, string>> {
  if (!isRecord(given)) return {};
  return Object.fromEntries(Object.entries(given).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * Runs a tool and turns its result into the wire form (images as base64, files written by the desktop app).
 * @param name the tool's name
 * @param args its arguments
 * @returns the answer
 */
async function runTool(name: string, args: Record<string, unknown>): Promise<WireResult> {
  const tool = toolNamed(name);
  if (!tool) throw new ToolError(`Unknown tool ${name}`);
  const result = await tool.run(args, env);
  const wire: WireResult = { ok: true, text: result.text, json: result.json };
  if (result.image) wire.image = { data: await base64Of(result.image), mimeType: result.image.type || 'image/png' };
  if (result.files?.length && agentBridge)
    wire.paths = await agentBridge.writeFiles(await Promise.all(result.files.map(async (file) => ({ name: file.name, data: await file.blob.arrayBuffer() }))));
  return wire;
}

/**
 * Answers one call from the main process.
 * @param name a tool's name, or __list, __resource or __prompt
 * @param args the call's arguments
 * @returns the answer
 */
async function handle(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === '__list') return catalogue();
  if (name === '__resource') {
    const resource = RESOURCES.find((candidate) => candidate.uri === args.uri);
    if (!resource) throw new ToolError(`Unknown resource ${String(args.uri)}`);
    return { uri: resource.uri, mimeType: resource.mimeType, text: await resource.read() };
  }
  if (name === '__prompt') {
    const prompt = PROMPTS.find((candidate) => candidate.name === args.name);
    if (!prompt) throw new ToolError(`Unknown prompt ${String(args.name)}`);
    return { description: prompt.description, text: prompt.build(promptArgsOf(args.arguments)) };
  }
  return runTool(name, args);
}

let queue: Promise<unknown> = Promise.resolve();
let isInstalled = false;

/** Starts answering the main process's agent calls (once; desktop only). */
export function installAgentBridge(): void {
  if (isInstalled || !agentBridge) return;
  isInstalled = true;
  agentBridge.onCall(({ id, name, args }) => {
    queue = queue.then(async () => {
      try {
        agentBridge.reply(id, await handle(name, isRecord(args) ? args : {}));
      } catch (error) {
        agentBridge.reply(id, { ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WireResult);
      }
    });
  });
  // Tells the main process the tools are ready (headless start waits for this).
  agentBridge.reply(0, { ready: true });
}

installAgentBridge();
