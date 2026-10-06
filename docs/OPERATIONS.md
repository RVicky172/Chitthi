# Operating the web app

How to run the Chitthi web app in production: the container, TLS, headers, updates and rollback. The app is static
files with no backend and no user data on the server, so operations are mostly about serving those files safely.
[build.md](../specs/build.md) covers building; [DESKTOP.md](DESKTOP.md) covers the desktop app.

## What runs

| Part | Detail |
| --- | --- |
| Image | `Dockerfile`: `node:26-alpine` builds `dist/`, then `nginxinc/nginx-unprivileged:1.31-alpine` serves it. Both base images are pinned by digest |
| Process | nginx as a non-root user, listening on **8080** (plain HTTP) |
| Health check | `GET /healthz` → `200 ok` (also the image's `HEALTHCHECK`) |
| State | None. Nothing is written except nginx's temporary files in `/tmp` |
| Outbound calls from the server | None. Visitors' browsers call Google Fonts, Pexels and AI services directly |

## Run it

```bash
docker compose up -d --build     # http://localhost:8080
```

`docker-compose.yml` already applies the hardening the image is built for: read-only root file system, a tmpfs at
`/tmp`, every Linux capability dropped, and `no-new-privileges`. Keep those flags on any other orchestrator. For
Kubernetes:

```yaml
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities: { drop: [ALL] }
```

with an `emptyDir` mounted at `/tmp`, and liveness and readiness probes on `GET /healthz` port 8080.

## TLS and HSTS

The container speaks HTTP only. Put a TLS-terminating proxy in front (Caddy, Traefik, a cloud load balancer, or
another nginx) and set HSTS **there**, once HTTPS works for the whole domain:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

HTTPS is also required for the service worker (offline use) to register on a real domain.

## Security headers and CSP

Every response carries the headers in `nginx/security-headers.conf`: `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and the Content Security Policy.

The CSP's `connect-src` lists the AI services the web app can call, and `huggingface.co` with its CDN `*.hf.co` for
the AI sky-mask model (downloaded only when a user agrees). If your users need a **custom OpenAI-compatible
service**, add its origin there and rebuild; otherwise the browser blocks the call. `script-src` carries
`'wasm-unsafe-eval'` so the AI-mask models can run as WebAssembly (it allows no JavaScript `eval`); don't loosen it
further. The image now ships the subject model (4.6 MB) and ONNX Runtime's WebAssembly (14 MB) as hashed assets,
served like any other.

Check the headers after a deploy:

```bash
curl -sI https://your.domain/ | grep -iE 'content-security-policy|x-content-type|strict-transport'
```

## Caching

| Path | Cache-Control | Why |
| --- | --- | --- |
| `/assets/*` | 1 year, `immutable` | File names carry a content hash |
| `/index.html`, `/sw.js`, `/` and other routes | `no-cache` | Visitors pick up a new release on their next load |
| `/manifest.webmanifest`, icons | 7 days | Rarely change |

A CDN in front should respect these headers. After a release, nothing needs purging: new asset names bypass old caches,
and `index.html` is always revalidated.

## Upgrade

1. Pull the new tag: `git fetch --tags && git checkout vX.Y.Z`.
2. `docker compose up -d --build`. The old container serves until the new one is up.
3. Check `/healthz`, load the app, and check the headers as above.

Returning visitors get the new version on their next page load; the service worker cache name (`APP_CACHE` in
`public/sw.js`) changes with each release.

## Roll back

The server has no state, so rolling back is just running the previous version:

```bash
git checkout vPREVIOUS && docker compose up -d --build
```

Faster: tag each image you deploy (`docker-compose.yml` names it `chitthi-postcard-studio:<version>`) and keep the
previous one, then point the service back at it. Visitors' browsers revalidate `index.html` and load the old assets.

## Logs and monitoring

- nginx access and error logs go to the container's stdout and stderr (`docker logs chitthi`). `/healthz` isn't logged.
- Monitor `GET /healthz` from outside, and alert on TLS certificate expiry at the proxy.
- The app sends no telemetry. Users can copy an error report from the error screen or the performance monitor and
  attach it to an issue ([PRIVACY.md](../PRIVACY.md)).

## Keeping it patched

Dependabot opens weekly pull requests for npm packages, GitHub Actions and the two Docker base images. CI builds and
smoke-tests the image once per release (and its dry run), not on pull requests, so before deploying a base-image
update between releases, build and check it yourself: `docker compose build`, `docker compose up -d`, then
`curl -sf http://127.0.0.1:8080/healthz`. Rebuild and redeploy after merging a base-image update, even without an app
release.
