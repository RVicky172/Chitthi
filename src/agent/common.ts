import { isRawName } from '../engine/raw';

/*
 * Shared by the agent tool registries (tools.ts for print designs, photoTools.ts for the photo studio): the tool shape,
 * JSON Schema helpers, argument readers and the error type whose message goes back to the agent.
 */

export interface ToolFile {
  name: string;
  blob: Blob;
}
export interface ToolResult {
  text: string;
  json?: unknown;
  image?: Blob;
  files?: ToolFile[];
}
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  destructive?: boolean;
  run(args: Record<string, unknown>, env: AgentEnv): Promise<ToolResult>;
}
export interface AgentEnv {
  /** Desktop: reads an image file the agent names (the main process checks type and size). */
  readPhoto?: (path: string) => Promise<{ name: string; data: ArrayBuffer; type: string }>;
}

export const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
export const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });
export const bool = (description: string) => ({ type: 'boolean', description });

export const s = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const n = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const ok = (text: string, json?: unknown): ToolResult => ({ text, json });
export class ToolError extends Error {}

export const toBlob = (cv: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new ToolError('The image couldn’t be made.'))), type, q));

/** An image the agent names by local path (desktop) or https URL, checked to be JPG, PNG or WebP (or camera RAW, with `raw`). */
export async function fetchImage(a: Record<string, unknown>, env: AgentEnv, opts: { raw?: boolean } = {}): Promise<{ name: string; blob: Blob }> {
  let blob: Blob, name: string;
  if (typeof a.path === 'string' && a.path) {
    if (!env.readPhoto) throw new ToolError('Local files can be added in the desktop app only.');
    const f = await env.readPhoto(a.path);
    blob = new Blob([f.data], { type: f.type });
    name = s(a.name) || f.name;
  } else if (typeof a.url === 'string' && /^https:\/\//.test(a.url)) {
    const r = await fetch(a.url);
    if (!r.ok) throw new ToolError(`The image couldn’t be downloaded (${r.status}).`);
    blob = await r.blob();
    name = s(a.name) || decodeURIComponent(a.url.split('/').pop() ?? 'photo').slice(0, 60);
  } else throw new ToolError('Give a local file path or an https URL.');
  if (opts.raw && (blob.type === 'image/x-raw' || isRawName(name))) return { name, blob };
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new ToolError(opts.raw ? 'Only JPG, PNG, WebP or camera RAW photos can be used.' : 'Only JPG, PNG or WebP images can be used.');
  return { name, blob };
}
