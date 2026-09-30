/*
 * AI providers Chitthi can use with the user's own API key. Descriptive data only: each provider's code lives in
 * src/ai/providers/ and is loaded when first used (src/ai/registry.ts). How each one authenticates, and which hosts
 * may receive its key, is in electron/ai-hosts.json, shared with the desktop main process.
 *
 * `web` says whether a browser may call the provider directly (checked with CORS preflights): 'direct' works in the
 * web app and the desktop app; 'desktop' works in the desktop app only, where calls run in the main process.
 * Model names are suggestions: every provider with a models endpoint lists the account's real models in Settings.
 */

export type AiProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'together'
  | 'ollama'
  | 'lmstudio'
  | 'custom'
  | 'stability'
  | 'bfl'
  | 'fal'
  | 'replicate'
  | 'ideogram';

export type AiKind = 'text' | 'image';

export interface AiProviderDef {
  id: AiProviderId;
  name: string;
  kinds: AiKind[];
  /** 'direct': the browser can call it (web and desktop); 'desktop': desktop app only (no CORS). */
  web: 'direct' | 'desktop';
  /** API base URL (OpenAI-compatible providers); editable for local and custom ones. */
  base?: string;
  /** Needs an API key (local servers don't). */
  key: boolean;
  keyUrl?: string;
  docsUrl: string;
  /** Suggested models, first is the default. The live list from the provider replaces these where possible. */
  textModels?: string[];
  imageModels?: string[];
  note?: string;
}

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    kinds: ['text'],
    web: 'direct',
    key: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.claude.com/en/api/overview',
    textModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'],
    note: 'Best at warm, natural wishes in English, Hindi and Hinglish. Uses the official Anthropic SDK.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kinds: ['text', 'image'],
    web: 'direct',
    base: 'https://api.openai.com/v1',
    key: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    textModels: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
    imageModels: ['gpt-image-1', 'gpt-image-1-mini'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kinds: ['text', 'image'],
    web: 'direct',
    key: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    textModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    imageModels: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kinds: ['text'],
    web: 'direct',
    base: 'https://openrouter.ai/api/v1',
    key: true,
    keyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    textModels: ['anthropic/claude-sonnet-5-5', 'openai/gpt-5-mini', 'google/gemini-2.5-flash'],
    note: 'One key for many models from many companies.',
  },
  {
    id: 'groq',
    name: 'Groq',
    kinds: ['text'],
    web: 'direct',
    base: 'https://api.groq.com/openai/v1',
    key: true,
    keyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    textModels: ['llama-3.3-70b-versatile'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kinds: ['text'],
    web: 'direct',
    base: 'https://api.deepseek.com',
    key: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com',
    textModels: ['deepseek-chat'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    kinds: ['text'],
    web: 'direct',
    base: 'https://api.mistral.ai/v1',
    key: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    docsUrl: 'https://docs.mistral.ai',
    textModels: ['mistral-small-latest', 'mistral-large-latest'],
  },
  {
    id: 'together',
    name: 'Together AI',
    kinds: ['text'],
    web: 'direct',
    base: 'https://api.together.xyz/v1',
    key: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    docsUrl: 'https://docs.together.ai',
    textModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  },
  {
    id: 'ollama',
    name: 'Ollama (on this computer)',
    kinds: ['text'],
    web: 'direct',
    base: 'http://localhost:11434/v1',
    key: false,
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    textModels: ['llama3.2', 'qwen2.5'],
    note: 'Free and private: runs on your computer. From the web app, start Ollama with OLLAMA_ORIGINS set to this site.',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (on this computer)',
    kinds: ['text'],
    web: 'direct',
    base: 'http://localhost:1234/v1',
    key: false,
    docsUrl: 'https://lmstudio.ai/docs/app/api',
    note: 'Free and private: runs on your computer. Turn on CORS in LM Studio’s server settings for the web app.',
  },
  {
    id: 'custom',
    name: 'Other OpenAI-compatible service',
    kinds: ['text'],
    web: 'direct',
    base: '',
    key: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    note: 'Any service with an OpenAI-style /chat/completions endpoint. Enter its base URL.',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    kinds: ['image'],
    web: 'direct',
    key: true,
    keyUrl: 'https://platform.stability.ai/account/keys',
    docsUrl: 'https://platform.stability.ai/docs/api-reference',
    imageModels: ['core', 'ultra', 'sd3'],
  },
  {
    id: 'fal',
    name: 'fal.ai (FLUX and more)',
    kinds: ['image'],
    web: 'direct',
    key: true,
    keyUrl: 'https://fal.ai/dashboard/keys',
    docsUrl: 'https://fal.ai/docs',
    imageModels: ['fal-ai/flux/dev', 'fal-ai/flux-pro/v1.1', 'fal-ai/flux/schnell'],
  },
  {
    id: 'bfl',
    name: 'Black Forest Labs (FLUX)',
    kinds: ['image'],
    web: 'desktop',
    key: true,
    keyUrl: 'https://dashboard.bfl.ai/',
    docsUrl: 'https://docs.bfl.ai',
    imageModels: ['flux-2-pro', 'flux-2-flex', 'flux-dev'],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    kinds: ['image'],
    web: 'desktop',
    key: true,
    keyUrl: 'https://replicate.com/account/api-tokens',
    docsUrl: 'https://replicate.com/docs/reference/http',
    imageModels: ['black-forest-labs/flux-schnell', 'black-forest-labs/flux-1.1-pro'],
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    kinds: ['image'],
    web: 'desktop',
    key: true,
    keyUrl: 'https://ideogram.ai/manage-api',
    docsUrl: 'https://developer.ideogram.ai',
    imageModels: ['V_3'],
    note: 'Good at lettering inside images.',
  },
];

export const providerDef = (id: string): AiProviderDef | undefined => AI_PROVIDERS.find((p) => p.id === id);
export const providersFor = (kind: AiKind): AiProviderDef[] => AI_PROVIDERS.filter((p) => p.kinds.includes(kind));

/** Languages the words can be written in, with a font that has the script. */
export const AI_LANGUAGES: { id: string; name: string; font?: string; script: 'latin' | 'deva' | 'other' }[] = [
  { id: 'en', name: 'English', script: 'latin' },
  { id: 'hi', name: 'हिन्दी (Hindi)', font: 'Tiro Devanagari Hindi', script: 'deva' },
  { id: 'hinglish', name: 'Hinglish (Hindi in English letters)', script: 'latin' },
  { id: 'mr', name: 'मराठी (Marathi)', font: 'Tiro Devanagari Hindi', script: 'deva' },
  { id: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)', font: 'Baloo Paaji 2', script: 'other' },
  { id: 'gu', name: 'ગુજરાતી (Gujarati)', font: 'Baloo Bhai 2', script: 'other' },
  { id: 'bn', name: 'বাংলা (Bengali)', font: 'Baloo Da 2', script: 'other' },
  { id: 'ta', name: 'தமிழ் (Tamil)', font: 'Baloo Thambi 2', script: 'other' },
  { id: 'te', name: 'తెలుగు (Telugu)', font: 'Baloo Tammudu 2', script: 'other' },
  { id: 'kn', name: 'ಕನ್ನಡ (Kannada)', font: 'Baloo Tamma 2', script: 'other' },
  { id: 'ml', name: 'മലയാളം (Malayalam)', font: 'Baloo Chettan 2', script: 'other' },
  { id: 'or', name: 'ଓଡ଼ିଆ (Odia)', font: 'Baloo Bhaina 2', script: 'other' },
];

export const AI_TONES = ['warm', 'playful', 'formal', 'poetic', 'short and sweet'] as const;
