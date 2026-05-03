import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Manifest } from './needsRegeneration.js'
import { spawnSync } from 'node:child_process'
import { recreateHttpProxy } from '../httpproxy/recreateHttpProxy.js'
import { SecureClaudeConfig } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function recreateFiles(config: SecureClaudeConfig): Promise<void> {
  console.debug(`Generating files into "${config.tmpFolder}"...`)
  await fsp.mkdir(config.tmpFolder, { recursive: true })
  await copyComposeTemplate(config)
  await recreateHttpProxy(config)
  await writeManifest(config)
  buildDockerImage(config)
}

async function copyComposeTemplate(config: SecureClaudeConfig): Promise<void> {
  const templatePath = path.join(__dirname, 'docker-compose.yaml.template')
  let content = await fsp.readFile(templatePath, 'utf8')
  const vars: Record<string, string> = {
    USER: os.userInfo().username,
    UID: String(os.userInfo().uid),
    CWD: process.cwd(),
  }
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`\${${key}}`, value)
  }
  await fsp.writeFile(path.join(config.tmpFolder, 'docker-compose.yaml'), content, 'utf8')
  // TODO: Add more volumes and overwrite forbidden files
}

async function writeManifest(config: SecureClaudeConfig): Promise<void> {
  // TODO: Add the version of myself, so that if the version change I can update
  const configFileLastChange = config.configPath
    ? new Date((await fsp.stat(config.configPath)).mtimeMs).toISOString()
    : undefined

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    ...(configFileLastChange !== undefined ? { configFileLastChange } : {}),
  }

  await fsp.writeFile(
    path.join(config.tmpFolder, '.manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
}

function buildDockerImage(config: SecureClaudeConfig) {
  console.debug('Building docker image...')
  const result = spawnSync('docker', ['compose', 'build'], {
    cwd: config.tmpFolder,
    stdio: undefined, // Suppress output; we'll handle errors based on exit code
  })

  if (result.error) {
    const msg = (result.error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'Docker not found — is it installed and on your PATH?'
      : `Failed to spawn docker: ${result.error.message}`
    console.error(msg)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`Docker build failed with exit code ${result.status?.toString() ?? 'unknown'}`)
    process.exit(1)
  }
  console.debug('Docker image built successfully.')
}
