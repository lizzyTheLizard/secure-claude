# Release Notes

## 1.1.1

### Fixes

- Fixed `ERR_MODULE_NOT_FOUND` error for `@cfworker/json-schema` when installing via `npm install -g secure-claude`. The transitive peer dependencies of `@modelcontextprotocol/node` (`@modelcontextprotocol/server`, `hono`, `@cfworker/json-schema`) are now declared as explicit dependencies so all package managers install them correctly.

## 1.1.0

- **MCP server plugins** — users can now connect Claude to additional MCP servers from inside the secure container. Configure extra MCP servers via `mcpPlugins` in the config; they are proxied through the host-side MCP server.

## 1.0.7

- Fixed publish pipeline
- Improved documentation
- Dependency updates (eslint 10, typescript-eslint, @types/node)

## 1.0.2

Initial public release.
