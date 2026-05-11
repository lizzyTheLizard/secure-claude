# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. See [README.md](README.md) for general documentation, architecture overview, and the release process.

## Commands

```bash
pnpm build        # tsc + copy non-TS assets (templates, squid.conf) into dist/
pnpm lint         # eslint across the whole project
pnpm start        # node dist/bin/index.js (run from dist/ without installing globally)
pnpm test         # run all tests (unit + integration; integration requires working claude instance + Docker)
pnpm test:watch   # vitest watch mode
```

TypeScript is compiled to `dist/` with `tsc`; the `scripts/copy-assets.mjs` step copies template files that `tsc` ignores (`.yaml.template`, `squid.conf.template`).

## Tests

Tests live in `tests/` and are run with vitest. Two naming conventions are used:

- `*.unit.test.ts` — pure unit tests, no external dependencies, run anywhere.
- `*.integration.test.ts` — end-to-end tests that spin up real Docker containers. First run builds the Docker image (~2–5 min); subsequent runs use the layer cache. All tests run sequentially to avoid Docker container name conflicts. Two sub-categories:
  - Most integration tests only need Docker running. These run in CI.
  - `claude.integration.test.ts` spawns the full tool with a real Claude Code process and asserts on HTTP status codes returned from inside the container. It requires a working Claude login (`ANTHROPIC_API_KEY` env var, a `.env` file at the project root, or a prior interactive `pnpm start` session) and is **excluded from CI** — run it locally when you need end-to-end coverage.

## Architecture

See README.md for the architecture overview and network topology.

Key implementation details for navigating the code:

- **Config loading & defaults** — `src/bin/config.ts`
- **Regeneration check** — `src/bin/needsRegeneration.ts` (compares `.manifest.json` stamp against config mtime)
- **Docker Compose generation** — `src/bin/recreate.ts` + `src/bin/docker-compose.yaml.template` (substitutes `${USER}`, `${UID}`, `${CWD}`)
- **Squid config generation** — `src/httpproxy/recreateHttpProxy.ts` + `src/httpproxy/squid.conf.template` (substitutes `${ACCESS_RULES}`, `${DNS_SERVERS}`, `${PROXY_RULES}`)
- **MCP server** — `src/mcp/server.ts` runs on the host machine and exposes configured plugins; the container connects to it via `host.docker.internal:mcpPort`. The MCP config file pointing at the host server is written by `src/mcp/recreateMcpConfig.ts`

Adding a new config knob: update `SecureClaudeConfig` in `config.ts`, add a default in `loadConfig`, add generation logic in `recreateHttpProxy.ts` or `recreate.ts`, update the relevant template, and update the manifest fields if cache invalidation should be tied to it.
