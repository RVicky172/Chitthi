import { isRecord } from '../engine/guards';
import { isRawName } from '../engine/raw';

/*
 * Shared by the agent tool registries (tools.ts for print designs, photoTools.ts for the photo studio): the tool shape,
 * JSON Schema helpers, argument readers and the error type whose message goes back to the agent.
 */

/** A file a tool made; the desktop app writes it into the agent output folder. */
export interface ToolFile {
  name: string;
  blob: Blob;
}

/** What a tool gives back: a line for the agent, data, an image to look at, files. */
export interface ToolResult {
  text: string;
  json?: unknown;
  image?: Blob;
  files?: ToolFile[];
}

/**
 * One agent tool (Command pattern). Every caller awaits `run`, so a handler that needs nothing asynchronous returns
 * its result directly; a throw then rejects the call the same way.
 */
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  /** The arguments, as JSON Schema. */
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  destructive?: boolean;
  run(args: Record<string, unknown>, env: AgentEnv): ToolResult | Promise<ToolResult>;
}

/** What the app around the tools offers them. */
export interface AgentEnv {
  /** Desktop: reads an image file the agent names (the main process checks type and size). */
  readPhoto?: (path: string) => Promise<{ name: string; data: ArrayBuffer; type: string }>;
}

/**
 * An object's JSON Schema (no other properties allowed).
 * @param properties each property's schema
 * @param required the properties that must be given
 * @returns the schema
 */
export const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

/**
 * A string's JSON Schema.
 * @param description what it is, for the agent
 * @param extra more keywords (enum …)
 * @returns the schema
 */
export const stringSchema = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });

/**
 * A number's JSON Schema.
 * @param description what it is, for the agent
 * @param extra more keywords (minimum, maximum, enum …)
 * @returns the schema
 */
export const numberSchema = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });

/**
 * A boolean's JSON Schema.
 * @param description what it is, for the agent
 * @returns the schema
 */
export const booleanSchema = (description: string) => ({ type: 'boolean', description });

/**
 * An argument read as a string.
 * @param value the argument
 * @param fallback what to use when it isn't a string
 * @returns the string
 */
export const stringArg = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/**
 * An argument read as a finite number.
 * @param value the argument
 * @param fallback what to use when it isn't a finite number
 * @returns the number
 */
export const numberArg = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * An argument read as a plain object.
 * @param value the argument
 * @returns the object, or an empty one for anything else (arrays too)
 */
export const recordArg = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/**
 * A plain result.
 * @param text the line for the agent
 * @param json the data
 * @returns the result
 */
export const ok = (text: string, json?: unknown): ToolResult => ({ text, json });

/** An error whose message goes back to the agent as the tool's answer. */
export class ToolError extends Error {}

/**
 * A canvas as an image file.
 * @param canvas the canvas
 * @param type the image type
 * @param quality for lossy types, 0–1
 * @returns the file
 */
export const toBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ToolError('The image couldn’t be made.'))), type, quality);
  });

/**
 * The image an agent names by local path (desktop) or https URL.
 * @param args the tool's arguments: `path` or `url`, and an optional `name`
 * @param env the app around the tools (reads local files on desktop)
 * @param options `raw`: camera RAW files are accepted too
 * @returns its name and bytes
 * @throws ToolError unless it is JPG, PNG or WebP (or camera RAW, with `raw`)
 */
export async function fetchImage(args: Record<string, unknown>, env: AgentEnv, options: { raw?: boolean } = {}): Promise<{ name: string; blob: Blob }> {
  let blob: Blob;
  let name: string;
  if (typeof args.path === 'string' && args.path) {
    if (!env.readPhoto) throw new ToolError('Local files can be added in the desktop app only.');
    const file = await env.readPhoto(args.path);
    blob = new Blob([file.data], { type: file.type });
    name = stringArg(args.name) || file.name;
  } else if (typeof args.url === 'string' && args.url.startsWith('https://')) {
    const response = await fetch(args.url);
    if (!response.ok) throw new ToolError(`The image couldn’t be downloaded (${response.status}).`);
    blob = await response.blob();
    name = stringArg(args.name) || decodeURIComponent(args.url.split('/').pop() ?? 'photo').slice(0, 60);
  } else throw new ToolError('Give a local file path or an https URL.');
  if (options.raw && (blob.type === 'image/x-raw' || isRawName(name))) return { name, blob };
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type))
    throw new ToolError(options.raw ? 'Only JPG, PNG, WebP or camera RAW photos can be used.' : 'Only JPG, PNG or WebP images can be used.');
  return { name, blob };
}

/**
 * Reads a file as a data URL.
 * @param blob the file
 * @returns its data URL
 */
export const dataUrlOf = (blob: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('The file couldn’t be read.'));
    reader.readAsDataURL(blob);
  });
