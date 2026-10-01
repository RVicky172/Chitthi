import { SettingsDialog, installFontLinks, productDesign, replaceCard, setUI } from 'chitthi-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
// A words and a picture service chosen, with an obviously fake key, so the panels show their real form.
// Nothing is sent unless someone presses Write / Create.
localStorage.setItem('chitthi-ai', JSON.stringify({ text: { provider: 'anthropic', model: 'claude-opus-5-5' }, image: { provider: 'openai', model: 'gpt-image-1' } }));
localStorage.setItem('chitthi-ai-keys', JSON.stringify({ anthropic: 'preview-key', openai: 'preview-key' }));
setUI({ settings: true });

export const Settings = () => <SettingsDialog />;
