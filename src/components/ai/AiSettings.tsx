import { useEffect, useState } from 'react';
import { AI_PROVIDERS, providerDef, providersFor, type AiKind, type AiProviderDef, type AiProviderId } from '../../data/aiProviders';
import { runsHere } from '../../ai/registry';
import { deleteKey, keyStatus, setKey, type KeyInfo } from '../../ai/secrets';
import { listModels, testProvider } from '../../ai/service';
import { aiSettings, baseFor, onAiSettings, setAiSettings, usageToday, type AiSettings } from '../../ai/settings';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import { Check } from '../common';

/*
 * Settings → AI: which service writes words and which makes pictures, each provider's key (the user's own), base
 * URLs for local and custom services, daily limits, and (desktop) connecting an AI agent through MCP.
 */

type Status = Partial<Record<AiProviderId, KeyInfo>>;

export default function AiSettings() {
  const [s, setS] = useState<AiSettings>(aiSettings);
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
        Use your own account with an AI service to write greetings, quotes, captions and messages, and to make pictures for
        photo slots. Chitthi has no AI server: requests go from {isDesktop ? 'this app' : 'this browser'} straight to the service
        you choose, with your key, and only the words and descriptions you ask about are sent, never your photos.
      </p>
      <Choice kind="text" s={s} keys={keys} />
      <Choice kind="image" s={s} keys={keys} />

      <details className="aiprov">
        <summary>Keys and services</summary>
        <p className="hint">
          {isDesktop
            ? 'Keys are encrypted by your operating system and used only by the Chitthi app, which sends each one only to its own service.'
            : 'Keys stay in this browser (or this tab only) and are sent only to their own service. Services marked “desktop app” don’t allow calls from web pages.'}
        </p>
        {AI_PROVIDERS.map((p) => (
          <ProviderRow key={p.id} p={p} info={keys[p.id]} />
        ))}
      </details>

      <details className="aiprov">
        <summary>Limits</summary>
        <div className="row">
          <label className="f">
            Writing requests a day
            <input type="number" min={1} max={5000} value={s.limits.text} onChange={(e) => setAiSettings({ limits: { ...s.limits, text: Math.max(1, +e.target.value || 1) } })} />
          </label>
          <label className="f">
            Picture requests a day
            <input type="number" min={1} max={1000} value={s.limits.image} onChange={(e) => setAiSettings({ limits: { ...s.limits, image: Math.max(1, +e.target.value || 1) } })} />
          </label>
        </div>
        <p className="hint">
          Used today: {used.text} writing, {used.image} pictures. Each service bills your own account; the limits stop a mistake
          from running up a bill.
        </p>
        <Check checked={s.fallbacks} onChange={(fallbacks) => setAiSettings({ fallbacks })}>
          Claude: if a model declines a request, let Anthropic retry it on another Claude model (server-side fallback)
        </Check>
      </details>

      {desktop?.agent && <AgentConnect />}
    </section>
  );
}

/** The service and model for one kind of work. */
function Choice({ kind, s, keys }: { kind: AiKind; s: AiSettings; keys: Status }) {
  const cur = s[kind],
    list = providersFor(kind),
    def = cur.provider ? providerDef(cur.provider) : undefined;
  const [models, setModels] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setModels(null), [cur.provider]);
  const suggested = (kind === 'text' ? def?.textModels : def?.imageModels) ?? [];
  const options = [...new Set([...(models ?? []), ...suggested])];
  const ready = def && (!def.key || keys[def.id]?.has) && runsHere(def);
  return (
    <div className="aichoice">
      <div className="row">
        <label className="f">
          {kind === 'text' ? 'Writes words' : 'Makes pictures'}
          <select
            value={cur.provider}
            onChange={(e) => setAiSettings({ [kind]: { provider: e.target.value as AiProviderId | '', model: '' } } as Partial<AiSettings>)}
          >
            <option value="">Off</option>
            {list.map((p) => (
              <option key={p.id} value={p.id} disabled={!runsHere(p)}>
                {p.name}
                {!runsHere(p) ? ' (desktop app)' : ''}
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
            onChange={(e) => setAiSettings({ [kind]: { ...cur, model: e.target.value.trim() } } as Partial<AiSettings>)}
          />
          <datalist id={`ai-models-${kind}`}>
            {options.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      {def && (
        <p className={`hint ${ready ? '' : 'bad'}`}>
          {!runsHere(def)
            ? `${def.name} works in the desktop app only.`
            : def.key && !keys[def.id]?.has
              ? `Add your ${def.name} key under “Keys and services”.`
              : `Ready. Model: ${cur.model || suggested[0] || 'choose one'}.`}{' '}
          {ready && (
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const m = await listModels(def.id, kind);
                  setModels(m);
                  toast(m.length ? `${m.length} models loaded: pick one from the Model list.` : 'No models were listed; type the model name.');
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'The model list couldn’t be loaded.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Loading…' : 'Load my models'}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** One provider: key status, save and test, remove, base URL for local and custom services. */
function ProviderRow({ p, info }: { p: AiProviderDef; info?: KeyInfo }) {
  const [draft, setDraft] = useState('');
  const [session, setSession] = useState(false);
  const [base, setBase] = useState(() => (p.base !== undefined ? baseFor(p.id) : ''));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const editableBase = p.id === 'ollama' || p.id === 'lmstudio' || p.id === 'custom';
  const here = runsHere(p);
  const saveBase = () => setAiSettings({ bases: { ...aiSettings().bases, [p.id]: base.trim().replace(/\/+$/, '') } });
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await testProvider(p.id) });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'The test failed.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="aiprow">
      <summary>
        <b>{p.name}</b>
        <small>
          {p.kinds.map((k) => (k === 'text' ? 'words' : 'pictures')).join(' + ')}
          {p.web === 'desktop' ? ' · desktop app' : ''}
          {!p.key ? ' · no key needed' : info?.has ? ` · key saved${info.where === 'session' ? ' (this tab)' : ''}` : ''}
        </small>
      </summary>
      {p.note && <p className="hint">{p.note}</p>}
      {!here && <p className="hint bad">This service doesn’t allow calls from web pages. Use it in the Chitthi desktop app.</p>}
      {editableBase && (
        <label className="f">
          Base URL
          <span className="px-search">
            <input type="url" placeholder={p.base || 'https://…/v1'} value={base} onChange={(e) => setBase(e.target.value)} onBlur={saveBase} />
          </span>
        </label>
      )}
      {p.key && here && (
        <form
          className="setkey"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            if (editableBase) saveBase();
            await setKey(p.id, draft, { session, base: editableBase ? base.trim() : '' });
            setDraft('');
            await test();
          }}
        >
          <label className="f">
            {info?.has ? 'Replace your key' : 'Your API key'}
            <input type="password" autoComplete="off" spellCheck={false} placeholder="Paste the key here" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          {!isDesktop && (
            <Check checked={session} onChange={setSession}>
              Keep it for this tab only
            </Check>
          )}
          <div className="inline">
            <button type="submit" className="btn primary" disabled={!draft.trim() || busy}>
              {busy ? 'Testing…' : 'Save and test'}
            </button>
            {info?.has && (
              <button type="button" className="btn" onClick={() => void deleteKey(p.id).then(() => setMsg({ ok: true, text: 'Key removed.' }))}>
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
  useEffect(() => {
    void desktop!.agent!.status().then(setSt);
  }, []);
  const exe = desktop?.info.platform === 'darwin' ? '/Applications/Chitthi.app/Contents/MacOS/Chitthi' : '%LOCALAPPDATA%\\Programs\\Chitthi\\Chitthi.exe';
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast('Copied.'));
  const live = st?.on ? `claude mcp add --transport http chitthi-live ${st.url} --header "Authorization: Bearer ${st.token}"` : '';
  const headless = `claude mcp add chitthi -- "${exe}" --mcp`;
  return (
    <details className="aiprov" open={!!st?.on}>
      <summary>Connect an AI agent (MCP)</summary>
      <p className="hint">
        Let Claude Code, Claude Desktop, VS Code or Cursor use Chitthi’s tools: build designs, write words, check print quality and
        export print packs. See docs/MCP.md.
      </p>
      <Check
        checked={!!st?.on}
        onChange={async (on) => {
          // The tools answer from this window, so they load before the connection opens.
          if (on) await import('../../agent/bridge');
          setSt(await desktop!.agent!.setLive(on));
        }}
      >
        Let an agent work in this open window (live)
      </Check>
      {st?.on && (
        <>
          <p className="hint">Only programs on this computer with the token can connect. It stops when you turn this off or close Chitthi.</p>
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
