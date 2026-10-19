import { isRecord } from '../../engine/guards';
import { AiError, blobFromBase64, httpError, parseJsonLoose, type AiCtx, type ImageRequest, type JsonSchema, type ProviderModule, type TextRequest } from '../types';
import { fieldOf, listField, textField } from './read';

/*
 * Google Gemini (generativelanguage.googleapis.com, key in x-goog-api-key). Words: generateContent with a JSON
 * response schema. Pictures: generateContent with image output and an aspect ratio; the image comes back as base64
 * inline data. Both read the documented response paths and tolerate the newer "interactions" shape.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';

/** JSON Schema keywords Gemini's OpenAPI subset doesn't know. */
const UNKNOWN_KEYWORDS = new Set(['additionalProperties', '$schema']);

/**
 * Gemini's response schema is an OpenAPI subset: drop keywords it doesn't know.
 * @param schema a JSON Schema
 * @returns the schema without them, nested properties and items too
 */
function geminiSchema(schema: JsonSchema): JsonSchema {
  const converted: Record<string, unknown> = Object.fromEntries(Object.entries(schema).filter(([keyword]) => !UNKNOWN_KEYWORDS.has(keyword)));
  if (isRecord(schema.properties))
    converted.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [name, isRecord(property) ? geminiSchema(property) : property]),
    );
  if (isRecord(schema.items)) converted.items = geminiSchema(schema.items);
  return converted;
}

/**
 * Calls generateContent.
 * @param ctx the request context
 * @param body the request
 * @returns the parsed answer
 * @throws AiError when Gemini blocks the prompt or answers with an error
 */
async function call(ctx: AiCtx, body: unknown): Promise<unknown> {
  const response = await ctx.http.fetch(`${API}/models/${encodeURIComponent(ctx.model)}:generateContent`, { json: body, signal: ctx.signal });
  if (!response.ok) throw await httpError(response, 'Google Gemini');
  const answer: unknown = await response.json();
  if (textField(fieldOf(answer, 'promptFeedback'), 'blockReason')) throw new AiError('Gemini declined this request. Try different words.', 'refused');
  return answer;
}

/**
 * The parts of the first candidate's content.
 * @param answer the parsed answer
 * @returns the parts
 */
const partsOf = (answer: unknown): unknown[] => listField(fieldOf(listField(answer, 'candidates')[0], 'content'), 'parts');

/**
 * Structured words.
 * @param ctx the request context
 * @param req the prompts and schema
 * @returns the parsed JSON
 */
async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  const answer = await call(ctx, {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: { maxOutputTokens: req.maxTokens, responseMimeType: 'application/json', responseSchema: geminiSchema(req.schema) },
  });
  const text = partsOf(answer)
    .map((part) => textField(part, 'text') ?? '')
    .join('');
  if (!text) throw new AiError('Gemini returned no text. Try again.', 'bad-output');
  return parseJsonLoose(text);
}

/**
 * A picture in a response part (inlineData, or the snake_case inline_data).
 * @param part one part
 * @returns its picture, or null
 */
function pictureOf(part: unknown): Blob | null {
  const camelCase = fieldOf(part, 'inlineData');
  const inline = camelCase ?? fieldOf(part, 'inline_data');
  const data = textField(inline, 'data');
  if (!data) return null;
  return blobFromBase64(data, pngIfNone(textField(inline, camelCase == null ? 'mime_type' : 'mimeType')));
}

/**
 * A picture's type, PNG when the answer gives none.
 * @param type the type in the answer
 * @returns the type
 */
const pngIfNone = (type: string | undefined): string => (type === undefined || type === '' ? 'image/png' : type);

/**
 * Pictures, one request each.
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const pictures: Blob[] = [];
  for (let request = 0; request < Math.min(4, req.n); request++) {
    const answer = await call(ctx, {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: req.aspect } },
    });
    for (const part of partsOf(answer)) {
      const picture = pictureOf(part);
      if (picture) pictures.push(picture);
    }
    // The newer "interactions" shape.
    const outputImage = fieldOf(answer, 'output_image');
    const data = textField(outputImage, 'data');
    if (data) pictures.push(blobFromBase64(data, pngIfNone(textField(outputImage, 'mime_type'))));
  }
  if (!pictures.length) throw new AiError('Gemini returned no picture. Try a different description.', 'bad-output');
  return pictures;
}

/**
 * The account's models that can generate content.
 * @param ctx the request context
 * @returns their names without the "models/" prefix
 */
async function listModels(ctx: AiCtx): Promise<string[]> {
  const response = await ctx.http.fetch(`${API}/models?pageSize=200`, { signal: ctx.signal });
  if (!response.ok) throw await httpError(response, 'Google Gemini');
  return listField(await response.json(), 'models')
    .filter((model) => listField(model, 'supportedGenerationMethods').includes('generateContent'))
    .map((model) => (textField(model, 'name') ?? '').replace(/^models\//, ''));
}

export const text = {
  generateJSON,
  /** The models that write text: all but the image, embedding and speech ones. */
  listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((model) => !/image|embedding|tts|audio/i.test(model)),
};
export const image = {
  generate,
  /** The models that make images. */
  listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((model) => /image/i.test(model)),
};
const providerModule: ProviderModule = { text, image };
export default providerModule;
