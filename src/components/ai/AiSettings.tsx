import { useEffect, useState } from 'react';
import {
  AI_PROVIDERS,
  providerDef,
  providersFor,
  type AiKind,
  type AiProviderDef,
  type AiProviderId,
} from '../../data/aiProviders';
import { runsHere } from '../../ai/registry';
import { deleteKey, keyStatus, setKey, type KeyInfo } from '../../ai/secrets';
import { listModels, testProvider } from '../../ai/service';
import { aiSettings, baseFor, onAiSettings, setAiSettings, usageToday, type AiSettings } from '../../ai/settings';
import type { ModelState } from '../../ai/segment/models';
import type { AiTarget } from '../../engine/segments';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import { Check } from '../common';
import { logError } from '../../lib/errors';

/*
 * Settings → AI: which service writes words and which makes pictures, each provider's key (the user's own), base
 * URLs for local and custom services, daily limits, the AI models kept on this device (401), and (desktop) connecting
 * an AI agent through MCP.
 */

type Status = Partial<Record<AiProviderId, KeyInfo>>;

/**
 * A base URL without trailing slashes.
 * @param url the URL as typed
 * @returns the URL
 */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

/** The AI settings: which service writes words and makes pictures, keys and services, limits, on-device models and agents. */
export default function AiSettings() {
  const [settings, setS] = useState<AiSettings>(aiSettings);
  const [keys, setKeys] = useState<Status>({});
  useEffect(() => {
    const sync = () => {
      setS(aiSettings());
      void keyStatus().then(setKeys);
    };
    sync();
    return onAiSettings(sync);
  }, []);
  const used = usageToday();

  return (
    <section aria-labelledby="setAi" className="aiset">
      <h3 id="setAi">AI writing and pictures</h3>
      <p className="hint">
        Use your own account with an AI service to write greetings, quotes, captions and messages, and to make pictures
        for photo slots. Chitthi has no AI server: requests go from {isDesktop ? 'this app' : 'this browser'} straight
        to the service you choose, with your key, and only the words and descriptions you ask about are sent, never your
        photos.
      </p>
      <Choice kind="text" s={settings} keys={keys} />
      <Choice kind="image" s={settings} keys={keys} />

      <details className="aiprov">
        <summary>Keys and services</summary>
        <p className="hint">
          {isDesktop
            ? 'Keys are encrypted by your operating system and used only by the Chitthi app, which sends each one only to its own service.'
            : 'Keys stay in this browser (or this tab only) and are sent only to their own service. Services marked “desktop app” don’t allow calls from web pages.'}
        </p>
        {AI_PROVIDERS.map((provider) => (
          <ProviderRow key={provider.id} p={provider} info={keys[provider.id]} />
        ))}
      </details>

      <details className="aiprov">
        <summary>Limits</summary>
        <div className="row">
          <label className="f">
            Writing requests a day
            <input
              type="number"
              min={1}
              max={5000}
              value={settings.limits.text}
              onChange={(event) =>
                setAiSettings({ limits: { ...settings.limits, text: Math.max(1, +event.target.value || 1) } })
              }
            />
          </label>
          <label className="f">
            Picture requests a day
            <input
              type="number"
              min={1}
              max={1000}
              value={settings.limits.image}
              onChange={(event) =>
                setAiSettings({ limits: { ...settings.limits, image: Math.max(1, +event.target.value || 1) } })
              }
            />
          </label>
        </div>
        <p className="hint">
          Used today: {used.text} writing, {used.image} pictures. Each service bills your own account; the limits stop a
          mistake from running up a bill.
        </p>
        <Check checked={settings.fallbacks} onChange={(fallbacks) => setAiSettings({ fallbacks })}>
          Claude: if a model declines a request, let Anthropic retry it on another Claude model (server-side fallback)
        </Check>
      </details>

      <ModelsOnDevice />

      {desktop?.agent && <AgentConnect />}
    </section>
  );
}

interface ModelRowInfo {
  target: AiTarget;
  title: string;
  size: string;
  state: ModelState;
  status: string;
  canDelete: boolean;
}

/**
 * The on-device models of AI masks (401): where each one is, and Delete for a downloaded one. The segmenter is loaded
 * with import() when the section opens, so Settings doesn't carry it.
 */
function ModelsOnDevice() {
  const [rows, setRows] = useState<ModelRowInfo[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const seg = await import('../../ai/segment');
      const targets = Object.keys(seg.SEG_MODELS) as AiTarget[];
      setRows(
        await Promise.all(
          targets.map(async (target) => {
            const model = seg.SEG_MODELS[target],
              state = await seg.modelState(target);
            return { target, title: model.title, size: seg.sizeText(model.bytes), state, ...seg.modelRow(state) };
          }),
        ),
      );
    } catch (error) {
      logError('handled', error);
      setMsg('The models on this device couldn’t be read.');
    }
  };
  const remove = async (row: ModelRowInfo) => {
    setBusy(true);
    try {
      const why = await (await import('../../ai/segment')).deleteModel(row.target);
      setMsg(why ?? `The ${row.target} model was deleted: ${row.size} freed.`);
      await load();
    } catch (error) {
      logError('handled', error);
      setMsg(`The ${row.target} model couldn’t be deleted.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="aiprov" onToggle={(event) => event.currentTarget.open && !rows && void load()}>
      <summary>AI models on this device</summary>
      <p className="hint">
        Finding a subject or the sky in a photo uses AI models that run here, not on a server. A downloaded model is
        kept
        {isDesktop ? ' in the app’s data folder' : ' in this browser’s private storage for this site'} until you delete
        it; it is downloaded again, after asking, when it is next needed. Deleting one changes nothing else.
      </p>
      {rows ? (
        <ul className="aimodels">
          {rows.map((row) => (
            <li key={row.target}>
              <span>
                <span className="text-label">{row.title}</span> <small>{row.size}</small>
              </span>
              <span className="hint">{row.status}</span>
              {row.canDelete && (
                <button
                  type="button"
                  className="sbtn"
                  disabled={busy}
                  aria-label={`Delete the ${row.target} model`}
                  onClick={() => void remove(row)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !msg && <p className="hint">Looking…</p>
      )}
      <p className="hint" role="status">
        {msg}
      </p>
    </details>
  );
}

/**
 * Whether a chosen service is ready, in words.
 * @param def the service
 * @param hasKey whether its key is saved
 * @param model the model it will use
 * @returns desktop only, add your key, or ready with the model
 */
function readiness(def: AiProviderDef, hasKey: boolean, model: string): string {
  if (!runsHere(def)) return `${def.name} works in the desktop app only.`;
  if (def.key && !hasKey) return `Add your ${def.name} key under “Keys and services”.`;
  return `Ready. Model: ${model}.`;
}

/**
 * What the provider row says about its key.
 * @param needsKey whether the service needs a key
 * @param info the key's status, if known
 * @returns the note
 */
function keyNote(needsKey: boolean, info: KeyInfo | undefined): string {
  if (!needsKey) return ' · no key needed';
  if (!info?.has) return '';
  return ` · key saved${info.where === 'session' ? ' (this tab)' : ''}`;
}

/** The service and model for one kind of work. */
function Choice({ kind, s, keys }: Readonly<{ kind: AiKind; s: AiSettings; keys: Status }>) {
  const cur = s[kind],
    list = providersFor(kind),
    def = cur.provider ? providerDef(cur.provider) : undefined;
  // The models listed by a service, kept with the service they came from: another service shows none.
  const [loaded, setLoaded] = useState<{ provider: AiProviderId; models: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const models = loaded?.provider === cur.provider ? loaded.models : undefined;
  const suggested = (kind === 'text' ? def?.textModels : def?.imageModels) ?? [];
  const options = [...new Set([...(models ?? []), ...suggested])];
  const ready = def && (!def.key || keys[def.id]?.has) && runsHere(def);
  const loadModels = async (provider: AiProviderId) => {
    setBusy(true);
    try {
      const listed = await listModels(provider, kind);
      setLoaded({ provider, models: listed });
      toast(
        listed.length
          ? `${listed.length} models loaded: pick one from the Model list.`
          : 'No models were listed; type the model name.',
      );
    } catch (error) {
      logError('handled', error);
      toast(error instanceof Error ? error.message : 'The model list couldn’t be loaded.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="aichoice">
      <div className="row">
        <label className="f">
          {kind === 'text' ? 'Writes words' : 'Makes pictures'}
          <select
            value={cur.provider}
            onChange={(event) =>
              setAiSettings({
                [kind]: { provider: event.target.value as AiProviderId | '', model: '' },
              })
            }
          >
            <option value="">Off</option>
            {list.map((provider) => (
              <option key={provider.id} value={provider.id} disabled={!runsHere(provider)}>
                {provider.name}
                {!runsHere(provider) ? ' (desktop app)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Model
          <input
            type="text"
            list={`ai-models-${kind}`}
            placeholder={suggested[0] ?? 'model name'}
            value={cur.model}
            disabled={!def}
            onChange={(event) => setAiSettings({ [kind]: { ...cur, model: event.target.value.trim() } })}
          />
          <datalist id={`ai-models-${kind}`}>
            {options.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
      </div>
      {def && (
        <p className={`hint ${ready ? '' : 'bad'}`}>
          {readiness(def, !!keys[def.id]?.has, cur.model || (suggested[0] ?? '') || 'choose one')}{' '}
          {ready && (
            <button type="button" className="linkbtn" disabled={busy} onClick={() => void loadModels(def.id)}>
              {busy ? 'Loading…' : 'Load my models'}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** One provider: key status, save and test, remove, base URL for local and custom services. */
function ProviderRow({ p, info }: Readonly<{ p: AiProviderDef; info?: KeyInfo }>) {
  const [draft, setDraft] = useState('');
  // Web: a key lasts for this tab unless the user chooses to keep it (browser storage isn't encrypted).
  const [remember, setRemember] = useState(false);
  const [base, setBase] = useState(() => (p.base !== undefined ? baseFor(p.id) : ''));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const editableBase = p.id === 'ollama' || p.id === 'lmstudio' || p.id === 'custom';
  const here = runsHere(p);
  const saveBase = () =>
    setAiSettings({ bases: { ...aiSettings().bases, [p.id]: withoutTrailingSlashes(base.trim()) } });
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await testProvider(p.id) });
    } catch (error) {
      logError('handled', error);
      setMsg({ ok: false, text: error instanceof Error ? error.message : 'The test failed.' });
    } finally {
      setBusy(false);
    }
  };
  const saveKey = async () => {
    if (!draft.trim()) return;
    if (editableBase) saveBase();
    await setKey(p.id, draft, { session: !remember, base: editableBase ? base.trim() : '' });
    setDraft('');
    await test();
  };
  return (
    <details className="aiprow">
      <summary>
        <span className="text-label">{p.name}</span>
        <small>
          {p.kinds.map((kind) => (kind === 'text' ? 'words' : 'pictures')).join(' + ')}
          {p.web === 'desktop' ? ' · desktop app' : ''}
          {keyNote(p.key, info)}
        </small>
      </summary>
      {p.note && <p className="hint">{p.note}</p>}
      {!here && (
        <p className="hint bad">This service doesn’t allow calls from web pages. Use it in the Chitthi desktop app.</p>
      )}
      {editableBase && (
        <label className="f">
          Base URL
          <span className="px-search">
            <input
              type="url"
              placeholder={p.base?.length ? p.base : 'https://…/v1'}
              value={base}
              onChange={(event) => setBase(event.target.value)}
              onBlur={saveBase}
            />
          </span>
        </label>
      )}
      {p.key && here && (
        <form
          className="setkey"
          onSubmit={(event) => {
            event.preventDefault();
            void saveKey();
          }}
        >
          <label className="f">
            {info?.has ? 'Replace your key' : 'Your API key'}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the key here"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {!isDesktop && (
            <Check checked={remember} onChange={setRemember}>
              Remember on this device (kept unencrypted in this browser; the desktop app encrypts keys)
            </Check>
          )}
          <div className="inline">
            <button type="submit" className="btn primary" disabled={!draft.trim() || busy}>
              {busy ? 'Testing…' : 'Save and test'}
            </button>
            {info?.has && (
              <button
                type="button"
                className="btn"
                onClick={() => void deleteKey(p.id).then(() => setMsg({ ok: true, text: 'Key removed.' }))}
              >
                Remove key
              </button>
            )}
            {p.keyUrl && (
              <a className="linkbtn" href={p.keyUrl} target="_blank" rel="noopener noreferrer">
                Get a key
              </a>
            )}
          </div>
        </form>
      )}
      {!p.key && here && (
        <button type="button" className="btn" disabled={busy} onClick={() => void test()}>
          {busy ? 'Checking…' : 'Check connection'}
        </button>
      )}
      {msg && (
        <p className={`hint ${msg.ok ? 'good' : 'bad'}`} role="status">
          {msg.text}
        </p>
      )}
    </details>
  );
}

/** Desktop: let an AI agent (Claude Code and other MCP clients) drive this open app. */
function AgentConnect() {
  const [st, setSt] = useState<{ on: boolean; url: string; token: string } | null>(null);
  const agent = desktop?.agent;
  useEffect(() => {
    if (agent) void agent.status().then(setSt);
  }, [agent]);
  const exe =
    desktop?.info.platform === 'darwin'
      ? '/Applications/Chitthi Studio.app/Contents/MacOS/Chitthi Studio'
      : '%LOCALAPPDATA%\\Programs\\Chitthi Studio\\Chitthi Studio.exe';
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast('Copied.'));
  const live = st?.on
    ? `claude mcp add --transport http chitthi-live ${st.url} --header "Authorization: Bearer ${st.token}"`
    : '';
  const goLive = async (on: boolean) => {
    if (!agent) return;
    // The tools answer from this window, so they load before the connection opens.
    if (on) await import('../../agent/bridge');
    setSt(await agent.setLive(on));
  };
  const headless = `claude mcp add chitthi -- "${exe}" --mcp`;
  return (
    <details className="aiprov" open={!!st?.on}>
      <summary>Connect an AI agent (MCP)</summary>
      <p className="hint">
        Let Claude Code, Claude Desktop, VS Code or Cursor use Chitthi’s tools: build designs, write words, check print
        quality and export print packs. See docs/MCP.md.
      </p>
      <Check checked={!!st?.on} onChange={(on) => void goLive(on)}>
        Let an agent work in this open window (live)
      </Check>
      {st?.on && (
        <>
          <p className="hint">
            Only programs on this computer with the token can connect. It stops when you turn this off or close Chitthi.
          </p>
          <code className="aicmd">{live}</code>
          <button type="button" className="btn" onClick={() => copy(live)}>
            Copy the Claude Code command
          </button>
        </>
      )}
      <p className="hint">Or run Chitthi in the background for an agent, without a window (headless):</p>
      <code className="aicmd">{headless}</code>
      <button type="button" className="btn" onClick={() => copy(headless)}>
        Copy the headless command
      </button>
    </details>
  );
}
