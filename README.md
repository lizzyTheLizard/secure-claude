# secure-claude

Runs [Claude Code](https://claude.ai/code) inside a sandboxed Docker environment with only selected access to the host filesystem and network. Useful for safely running untrusted code generation prompts, or just as a general wrapper around Claude Code with better security defaults.

## Installation

```bash
npm install -g secure-claude
```

Requires [Docker](https://docker.com) to be running locally. The tool will automatically build and manage the necessary Docker images and containers.

## Usage

Run from any project directory:

```bash
secure-claude
```

On first run an interactive wizard creates a `secure-claude.yaml` config. After that the tool reads the existing config, rebuilds the Docker stack if needed, and launches Claude Code inside the container. Any additional arguments are forwarded to Claude Code:

```bash
secure-claude -p "refactor this module"   # non-interactive prompt
secure-claude init                        # (re-)run the interactive config wizard
secure-claude recreate                    # force-regenerate the Docker stack
```


### Configuration

The following configuration options are available in `secure-claude.yaml`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `tmpFolder` | string | `.secureclaude` | Directory (relative to project root) where generated files land (`docker-compose.yaml`, `squid.conf`, etc.) |
| `defaultAllow` | boolean | `false` | Internet default policy (deny-all vs allow-all) |
| `allowedDomains` | string[] | `[]` | HTTP whitelist ACL |
| `blockedDomains` | string[] | `[]` | HTTP blacklist ACL |
| `dnsServers` | string | `"1.1.1.1 8.8.8.8"` | Space-separated DNS IPs for outgoing requests |
| `proxy` | object\|`'NONE'` | `'NONE'` | Upstream HTTP proxy for Squid's outbound traffic. Set to `'NONE'` to disable, or provide `host`, `port`, and optionally `username`/`password` (see example below) |
| `mcpPort` | number | 9418 | Port the host-side MCP server listens on (the container connects to it via `host.docker.internal`) |
| `additionalVolumes` | VolumeMount[] | `[]` | Additional host paths to mount. By default only the current working directory is mounted into the container. Each entry should specify a path and a mode: ('ro' or 'rw') |
| `deniedPaths` | string[] | `[]` | Additional host paths to explicitly deny access to. This is a "deny list" that overrides any allow rules. Useful for blocking sensitive subdirectories under an otherwise allowed parent directory. Paths should be absolute or relative to the project root. |
| `projectName` | string | (current folder name) | A human-friendly name for the project, used for docker container naming and logging. Defaults to the current folder name. |
| `plugins` | [] | [] | A list of plugins (see below) |

Full example `secure-claude.yaml`:

```yaml
projectName: my-project
tmpFolder: .secureclaude

# Network policy: deny-all by default, whitelist specific domains
defaultAllow: false
allowedDomains:
  - .github.com
  - registry.npmjs.org
  - .mycompany.internal
blockedDomains: []

# DNS servers to resolve additional internal domains,  remove to use default ones
dnsServers: "127.129.10.12 127.129.10.13"

# Upstream proxy — remove or set to 'NONE' to disable
proxy:
  host: 127.129.10.1
  port: 8080
  username: alice       # optional
  password: secret      # optional

# Port for the host-side MCP server that exposes plugins to the container. Remove to use default 9418, or change if you have a conflict on that port.
mcpPort: 7615

# Mount additional host paths into the container
additionalVolumes:
  - path: /home/alice/.ssh
    mode: ro
  - path: /shared/data
    mode: rw

# Block sensitive subdirectories even when a parent path is mounted
deniedPaths:
  - /home/user/workingdir/.env
  - /home/alice/.ssh/id_rsa
  - /shared/data/secrets/

plugins:
  - type: git
    tools:
      blocked:
        - git_push        # prevent direct pushes; this has to be done manually from the host for better control and auditing
    filters:
      branches:           # restrict checkout/merge/delete to these 
        - 'main'
        - 'feature/.*'

  - type: github
    filters:
      repository: my-org/my-repo

  - type: commands
    commands:
      - name: run_tests
        description: Run the test suite.
        template: npm test {testSuite}
        params:
          - name: testSuite
            type: string
            description: Which test suite to run (e.g. "unit", "integration").
      - name: start_dev_server
        description: Start the development server.
        template: npm start

  - type: custom
    path: ./myCustomPlugin.js
```

### Plugins
The `plugins` config field allows you to specify additional plugins providing functionality to Claude. They run within an MCP server on the host machine. The following plugins are currently available:

#### Git Plugin
Run git commands (status, diff, log, commit, push, etc.) from within Claude.

```yaml
plugins:
  - type: git
    tools:
      enabled:               # allowlist of tools to enable (defaults to all)
        - git_commit
        - git_push
      blocked:               # tools to disable (overrides allowlist)
        - git_push
    filters:
      branches:              # regex patterns restricting branches for checkout/merge/delete
        - 'release/.*'
```

The following tools are available for the Git plugin:
| Tool Name | Description |
|---|---|
| `git_status` | Show the working tree status |
| `git_diff` | Show changes between commits, commit and working tree, etc. |
| `git_log` | Show recent commit log |
| `git_add` | Stage a file or path |
| `git_commit` | Commit staged changes |
| `git_push` | Push commits to the remote |
| `git_pull` | Fetch and merge from the remote |
| `git_checkout` | Switch branches or restore files (restricted by `branches` filter) |
| `git_branch_list` | List local branches |
| `git_branch_delete` | Delete a local branch (restricted by `branches` filter) |
| `git_merge` | Merge a branch into the current branch (restricted by `branches` filter) |
| `git_stash` | Stash current changes |
| `git_stash_pop` | Apply the most recent stash |


#### GitHub Plugin
Read and write GitHub issues, pull requests, and Actions workflows via the `gh` CLI.

```yaml
plugins:
  - type: github
    tools:
      enabled:               # allowlist of tools to enable (defaults to all)
        - issues.read
        - prs.read
        - prs.create
      blocked:               # tools to disable (overrides allowlist)
        - actions.trigger
    filters:
      repository: 'my-org/my-repo'   # restrict to a specific repository (format: owner/repo)
      branches:                      # regex patterns restricting branch operations
        - 'release/.*'
      labels:                        # restrict issue/PR access to specific labels
        - 'bug'
```

The following tools are available for the GitHub plugin:
| Tool Name | Description |
|---|---|
| `issues.read` | Read issues from the repository |
| `issues.write` | Create/update issues in the repository |
| `prs.read` | Read pull requests from the repository |
| `prs.create` | Create new pull requests in the repository |
| `prs.update` | Update existing pull requests in the repository |
| `actions.read` | Read GitHub Actions workflows and runs from the repository |
| `actions.trigger` | Trigger GitHub Actions workflows in the repository |


#### Custom Shell Plugin
Running custom shell commands on the host machine. E.g. run tests, start the dev server, or any other command you want to expose to Claude.

```yaml
plugins:
  - type: commands
    commands:
      - name: run_tests                      # A name for the command, one word.
        description: Run the test suite.     # A description of what the command does, shown to Claude.
        template: npm test {testSuite}       # The command template to run. Can include {paramName} placeholders for parameters.
        params:                               # A list of parameters that can be substituted into the template.
          - name: testSuite                   # The name of the parameter, used in the template as {testSuite}.
            type: string                      # The type of the parameter (string, number, boolean).
            description: Which test suite to run (e.g. "unit", "integration"). #Shown to Claude when deciding how to fill the parameter.
      - name: start_dev_server
        description: Start the development server.
        template: npm start
```

#### Custom Node Plugin
Running custom JavaScript code on the host machine. Useful for exposing complex functionality that doesn't fit well into a shell command, or for integrating with other tools and APIs.

```yaml
plugins:
  - type: custom
    path: ./myCustomPlugin.js   # Path to the plugin code on the host machine.
```

The plugin file must export a PluginFunction (see `src/plugin/plugin.ts`) that returns a list of PluginTools. Each tool represents a function that can be called from Claude, with a name, description, and an execute function that performs the desired action and returns the result. If it takes inputs, a zod inputSchema has to be defined. A outputSchema can also be defined to validate the output before it's sent back to Claude.


```js
// Example structure for a custom Node plugin
module.exports = function() {
  return [{
    name: 'hello_world', // A name for the tool, used when invoking it from Claude.
    description: 'Returns a greeting message', // A description of what the tool does, shown to Claude when deciding how to use it.
    execute: async () => ({ content: [{ type: 'text', text: 'hello from plugin' }] }) // The function that gets called when the tool is invoked. It returns the result of the tool's execution.
  }];
};
```

## Development

Prerequisites: [Node.js 22+](https://nodejs.org), [pnpm](https://pnpm.io), [Docker](https://docker.com).

```bash
pnpm install      # install dependencies
pnpm build        # compile TypeScript + copy asset files into dist/
pnpm lint         # run ESLint
pnpm start        # run the tool in the current directory from dist without installing globally
pnpm test         # run all tests (see Testing below)
```

### Architecture

The tool wraps Claude Code in a Docker Compose stack that enforces network policy via a Squid HTTP proxy.

```
host machine
  ├─ secure-claude (MCP server, port 9418)
  └─ Docker Compose
       ├─ claude  (intnet only) ──► Squid (httpproxy) ──► extnet ──► internet
       └─ httpproxy             ──► extnet
```

`intnet` is Docker-internal — only the `httpproxy` service has `extnet` access, so all Claude traffic must pass through Squid. The Squid config is generated from the `secure-claude.yaml` allowlist/blocklist before each run.

The MCP server runs on the host (not inside any container) and is reachable from the Claude container via `host.docker.internal:9418`. It loads configured plugins (git, github, commands, custom) and exposes them to Claude as MCP tools.

The entry point (`src/bin/index.ts`) runs the following steps on startup:

1. **Loads config** from `secure-claude.yaml` in `process.cwd()`, interactively creating it if not found. 
2. **Detects whether regeneration is needed** by comparing a `.manifest.json` stamp against the config file's mtime. Also triggered by the `recreate` CLI argument or a missing `tmpFolder`.
3. **Regenerates files** into `.secureclaude/` (`docker-compose.yaml`, `squid.conf`, etc) and rebuilds docker images if necessary.
4. **Runs Claude** 

### Structure

```
src/
  bin/          Entry point, config loading, regeneration logic, Docker Compose template
  httpproxy/    Squid config generation and template
  mcp/          Host-side MCP server and config generation
  plugin/         Plugin implementations (git, github, commands, custom)
  spawnHelper.ts  Shared helper for spawning child processes
tests/            Unit and integration tests (vitest)
scripts/          Build helpers (copy-assets.mjs)
```

### Testing

Tests are run with [vitest](https://vitest.dev). Two categories:

- **Unit tests** (`*.unit.test.ts`) — no external dependencies, run anywhere:
  ```bash
  pnpm vitest run .unit.test
  pnpm test:watch          # watch mode for TDD
  ```

- **Integration tests** (`*.integration.test.ts`) — spawn real Docker containers. First run builds the Docker image (~2–5 min); subsequent runs use the layer cache. Most integration tests only require Docker:
  ```bash
  pnpm vitest run --no-file-parallelism --exclude "tests/claude.integration.test.ts" .integration.test
  ```
  `claude.integration.test.ts` additionally requires a working Claude login and is **excluded from CI**. Run it locally when you need end-to-end coverage:
  ```bash
  pnpm vitest run tests/claude.integration.test.ts
  ```
  Set `ANTHROPIC_API_KEY` as an environment variable or in a `.env` file at the project root, or run `pnpm start` once and log in interactively before running the test.

### Releases

On merge to `main`, CI automatically creates a git tag and publishes to npm — but only when `package.json` version has changed. Run `pnpm check-release` locally to verify readiness before merging.

You can use the `/create-release` Claude skill. It inspects commits since the last release, proposes a semver bump and release notes, and opens a PR with the version bump and `RELEASE_NOTES.md` update. Do not manually create git tags, e.g. by using `pnpm version patch --no-git-tag-version` to increment the version without tagging.

## Contributing

Contributions are welcome! Please open an issue to discuss what you'd like to change, then submit a pull request. Make sure `pnpm lint` and `pnpm test` pass before opening a PR.

## License

MIT — see the [LICENSE](LICENSE) file.