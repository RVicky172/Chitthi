# syntax=docker/dockerfile:1
# Base images are pinned by digest (Dependabot proposes updates); the tag says which line each digest belongs to.

# ---------- 1. Build the React app ----------
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- 2. Serve the static files ----------
FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e

LABEL org.opencontainers.image.title="Chitthi Studio" \
      org.opencontainers.image.description="Print, Instagram and video studio for Indian festivals, birthdays and seasons (React 19.2 + TypeScript)" \
      org.opencontainers.image.licenses="MIT"

COPY --chown=nginx:nginx nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
