import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Manifest } from './needsRegeneration.js'
import { recreateHttpProxy } from '../httpproxy/recreateHttpProxy.js'
import { SecureClaudeConfig } from './config.js'
import { writeMcpConfig } from '../mcp/recreateMcpConfig.js'
import { spawnHelper } from '../spawnHelper.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER = os.userInfo().username
const UID = String(os.userInfo().uid)

export async function recreate(config: SecureClaudeConfig): Promise<void> {
  await recreateTmpDir(config)
  await recreateDockerContainers(config)
}

async function recreateTmpDir(config: SecureClaudeConfig): Promise<void> {
  const startTime = Date.now()
  await fsp.mkdir(config.tmpFolder, { recursive: true })
  await copyComposeTemplate(config)
  await recreateHttpProxy(config)
  await writeMcpConfig(config)
  await writeManifest(config)
  console.debug('Recreation of ' + config.tmpFolder + ' complete in ' + ((Date.now() - startTime) / 1000).toFixed(2) + 's')
}

async function copyComposeTemplate(config: SecureClaudeConfig): Promise<void> {
  console.debug('Copying docker-compose template to ' + config.tmpFolder)
  const templatePath = path.join(__dirname, 'docker-compose.yaml.template')
  let content = await fsp.readFile(templatePath, 'utf8')
  const additionalVolumes = await buildAdditionalVolumes(config)
  const vars: Record<string, string> = { USER: USER, UID: UID, CWD: process.cwd(), ADDITIONAL_VOLUMES: additionalVolumes, MCP_PORT: String(config.mcpPort) }
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`\${${key}}`, value)
  }
  await fsp.writeFile(path.join(config.tmpFolder, 'docker-compose.yaml'), content, 'utf8')
}

async function buildAdditionalVolumes(config: SecureClaudeConfig): Promise<string> {
  const lines: string[] = []

  for (const vol of config.additionalVolumes) {
    lines.push(`     - type: bind`)
    lines.push(`       source: ${vol.path}`)
    lines.push(`       target: ${vol.path}`)
    if (vol.mode === 'ro') lines.push(`       read_only: true`)
  }

  for (const denied of config.deniedPaths) {
    const isDir = await fsp.stat(denied).then(s => s.isDirectory()).catch(() => false)
    if (isDir) {
      lines.push(`     - type: tmpfs`)
      lines.push(`       target: ${denied}`)
    }
    else {
      lines.push(`     - type: bind`)
      lines.push(`       source: /dev/null`)
      lines.push(`       target: ${denied}`)
      lines.push(`       read_only: true`)
    }
  }

  return lines.join('\n')
}

async function writeManifest(config: SecureClaudeConfig): Promise<void> {
  console.debug('Writing manifest file...')
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

async function recreateDockerContainers(config: SecureClaudeConfig): Promise<void> {
  const startTime = Date.now()
  await buildDockerVolume()
  await buildDockerImage(config)
  console.debug('Recreated docker containers complete in ' + ((Date.now() - startTime) / 1000).toFixed(2) + 's')
}

async function buildDockerVolume(): Promise<void> {
  await spawnHelper('Create docker volume', 'docker', ['volume', 'create', `claudeHomeDir`])
  await spawnHelper('Initializing docker volume', 'docker', ['run', '--rm', '-v', `claudeHomeDir:/home`, 'node', '/bin/sh', '-c', `mkdir -p /home/${USER} && chown -R ${UID}:${UID} /home/${USER}`])
}

async function buildDockerImage(config: SecureClaudeConfig) {
  console.debug('Creating Docker image "claude"...')
  await spawnHelper('Create docker image', 'docker', ['compose', 'build'], config.tmpFolder)
}
