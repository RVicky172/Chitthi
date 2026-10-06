# Security policy

## Supported versions

Only the latest release gets security fixes. The desktop app updates itself from
[GitHub Releases](https://github.com/RVicky172/Chitthi/releases); self-hosted web deployments should rebuild from the
latest tag.

| Version | Supported |
| --- | --- |
| Latest 2.x release | Yes |
| Anything older | No: update first |

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through
[GitHub private vulnerability reporting](https://github.com/RVicky172/Chitthi/security/advisories/new).

Include what you found, the version (Settings or Help → About), web or desktop and the OS, steps to reproduce, and
what an attacker could do with it.

What to expect:

| Step | Within |
| --- | --- |
| Acknowledgement | 3 working days |
| First assessment (accepted or not, severity) | 10 working days |
| Fix released for a high or critical issue | 30 days, sooner when it is being exploited |

We credit reporters in the release notes unless you'd rather stay anonymous. Please give us a reasonable time to ship
a fix before you publish details.

## Scope

In scope:

- the web app and its nginx configuration (`nginx/`), and the Docker image;
- the desktop app: the Electron main process, preload bridge and IPC (`electron/`), the `app://` protocol, the
  on-disk library, API key storage and the auto-updater;
- the MCP server (`Chitthi --mcp` and the live loopback endpoint) and the Claude Code plugin (`plugins/chitthi`);
- how API keys are stored and where they are sent (`electron/ai-hosts.json`, `src/ai/transport.ts`).

Out of scope:

- the AI providers, Pexels, Google Fonts and GitHub themselves;
- attacks that need an already-compromised computer or administrator access;
- a user pasting their own key into a hostile copy of the app;
- missing hardening headers with no demonstrated impact.

## How Chitthi is protected

[specs/architecture.md §7](specs/architecture.md#7-security) describes the design: no backend, a strict Content Security Policy, a
sandboxed Electron renderer with a narrow IPC bridge, keys encrypted by the operating system on desktop, and an MCP
endpoint on loopback only with a random token.
