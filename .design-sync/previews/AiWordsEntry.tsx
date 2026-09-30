import { useEffect, useRef } from 'react';
import { AiWordsEntry, applyTheme, installFontLinks, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
// A words and a picture service chosen, with an obviously fake key, so the panels show their real form.
// Nothing is sent unless someone presses Write / Create.
localStorage.setItem('chitthi-ai', JSON.stringify({ text: { provider: 'anthropic', model: 'claude-opus-5-5' }, image: { provider: 'openai', model: 'gpt-image-1' } }));
localStorage.setItem('chitthi-ai-keys', JSON.stringify({ anthropic: 'preview-key', openai: 'preview-key' }));
applyTheme('diwali');

export const Buttons = () => (
  <div style={{ display: 'grid', gap: 10, width: 400 }}>
    <AiWordsEntry mode="card" />
    <AiWordsEntry mode="captions" />
    <AiWordsEntry mode="message" />
  </div>
);

// The panel opens under the button (and loads the AI code) when it's clicked.
export const OpenPanel = () => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.querySelector<HTMLButtonElement>('button')?.click(), []);
  return (
    <div ref={box} className="panel" style={{ width: 420 }}>
      <AiWordsEntry mode="card" />
    </div>
  );
};
