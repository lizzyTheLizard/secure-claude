# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build        # tsc + copy non-TS assets (templates, squid.conf) into dist/
pnpm lint         # eslint across the whole project
pnpm start        # node dist/bin/index.js recreate  (forces regeneration)
pnpm test         # run all tests (unit + integration; integration requires working claude instance + Docker)
pnpm test:watch   # vitest watch mode
```

TypeScript is compiled to `dist/` with `tsc`; the `scripts/copy-assets.mjs` step copies template files that `tsc` ignores (`.yaml.template`, `squid.conf.template`).

## Tests

Tests live in `tests/` and are run with vitest. Two naming conventions are used:

- `*.unit.test.ts` — pure unit tests, no external dependencies, run anywhere.
- `*.integration.test.ts` — end-to-end tests: each test creates a temp directory, writes a `secure-claude.yaml`, spawns `node dist/bin/index.js -p "<prompt>"`, and asserts on the HTTP status code Claude reports back from a `curl` inside the container. Requires Docker running and a valid `ANTHROPIC_API_KEY`. First run builds the Docker image (~2–5 min); subsequent runs use the layer cache. All tests run sequentially to avoid Docker container name conflicts.

  Set `ANTHROPIC_API_KEY` either as an environment variable or in a `.env` file at the project root:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```

## Architecture

The tool wraps Claude Code in a Docker Compose stack that enforces network policy via a Squid HTTP proxy. The user runs `node dist/bin/index.js` (or `pnpm start`) from any project directory. The entry point:

1. **Loads config** from `secure-claude.yaml` in `process.cwd()`, falling back to safe defaults (`defaultAllow: false`, Cloudflare/Google DNS, no proxy).
2. **Detects whether regeneration is needed** (`needsRegeneration.ts`) by comparing a `.manifest.json` stamp against the config file's mtime. Also triggered by the `recreate` CLI argument or a missing/empty `tmpFolder`.
3. **Regenerates files** into `tmpFolder` (default `.secureclaude/`):
   - `docker-compose.yaml` — templated from `src/bin/docker-compose.yaml.template`, substituting `${USER}`, `${UID}`, `${CWD}`.
   - `squid.conf` — templated from `src/httpproxy/squid.conf.template`, substituting `${ACCESS_RULES}`, `${DNS_SERVERS}`, `${PROXY_RULES}`.
   - Docker image is built via `docker compose build`.
4. **Runs Claude** via `docker compose run --rm claude <args>`, passing all CLI arguments after any consumed `recreate` token.

### Network topology

```
Claude container ──► Squid (httpproxy) ──► extnet ──► internet
                      intnet only              └─ extnet
```

`intnet` is Docker-internal; only `httpproxy` has `extnet` access. Claude traffic therefore must pass through Squid.

### Config schema (`secure-claude.yaml`)

| Field | Type | Default | Purpose |
|---|---|---|---|
| `tmpFolder` | string | `.secureclaude` | Where generated files land |
| `defaultAllow` | boolean | `false` | Squid default policy (deny-all vs allow-all) |
| `allowedDomains` | string[] | `[]` | Squid whitelist ACL |
| `blockedDomains` | string[] | `[]` | Squid blacklist ACL |
| `dnsServers` | string | `"1.1.1.1 8.8.8.8"` | Space-separated DNS IPs for Squid |
| `proxy` | object | — | Upstream proxy (`host`, `port`, `username`, `password`) |

When `defaultAllow: false`, access order is: deny blacklist → allow whitelist → allow localhost → deny all.  
When `defaultAllow: true`, access order is: allow whitelist → deny blacklist → allow all.

### Template substitution

Templates use `${VAR}` placeholders replaced with `String.replaceAll`. Adding a new config knob means: update `SecureClaudeConfig`, update `loadConfig` defaults, add logic in `recreateHttpProxy.ts` or `recreate.ts`, update the relevant template, and update the manifest if cache invalidation should be tied to it.
