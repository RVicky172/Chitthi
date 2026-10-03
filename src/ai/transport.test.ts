import { describe, expect, it } from 'vitest';
import { isResultHost, keyAllowed } from './transport';

// The web transport attaches a provider's key only where electron/ai-hosts.json allows it.
describe('keyAllowed', () => {
  it('allows the provider’s own API host over https', () => {
    expect(keyAllowed('openai', 'https://api.openai.com/v1/chat/completions', '')).toBe(true);
    expect(keyAllowed('anthropic', 'https://api.anthropic.com/v1/messages', '')).toBe(true);
  });

  it('refuses http, other hosts and look-alike hosts', () => {
    expect(keyAllowed('openai', 'http://api.openai.com/v1/models', '')).toBe(false);
    expect(keyAllowed('openai', 'https://api.anthropic.com/v1/messages', '')).toBe(false);
    expect(keyAllowed('openai', 'https://api.openai.com.evil.example/v1', '')).toBe(false);
    expect(keyAllowed('openai', 'https://evil.example/?u=https://api.openai.com', '')).toBe(false);
    expect(keyAllowed('openai', 'not a url', '')).toBe(false);
  });

  it('allows a local or custom service only at its own base URL', () => {
    expect(keyAllowed('ollama', 'http://localhost:11434/v1/chat/completions', 'http://localhost:11434/v1')).toBe(true);
    expect(keyAllowed('ollama', 'http://localhost:9999/v1', 'http://localhost:11434/v1')).toBe(false);
    expect(keyAllowed('custom', 'https://llm.example/v1/chat', 'https://llm.example/v1')).toBe(true);
    expect(keyAllowed('custom', 'https://other.example/v1/chat', 'https://llm.example/v1')).toBe(false);
    expect(keyAllowed('custom', 'https://llm.example/v1/chat', '')).toBe(false);
  });
});

describe('isResultHost', () => {
  it('matches subdomains of the result hosts over https only', () => {
    expect(isResultHost('fal', 'https://v3.fal.media/files/x.png')).toBe(true);
    expect(isResultHost('fal', 'http://v3.fal.media/files/x.png')).toBe(false);
    expect(isResultHost('fal', 'https://fal.media.evil.example/x.png')).toBe(false);
    expect(isResultHost('openai', 'https://v3.fal.media/files/x.png')).toBe(false);
  });
});
