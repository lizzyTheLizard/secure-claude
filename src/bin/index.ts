#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { configExists, loadConfig, SecureClaudeConfig } from './config.js'
import * as path from 'node:path'
import { needsRegeneration } from './needsRegeneration.js'
import { runInit } from './init.js'
import { recreate } from './recreate.js'
import { startMcpServer } from '../mcp/server.js'

main().catch(handleError)

async function main() {
  handleLogging()
  await handleInit()
  const config = await loadConfig()
  await handleRegeneration(config)
  const stopMcpServer = await startMcpServer(config)
  try {
    await runClaude(config)
  }
  finally {
    stopMcpServer()
  }
}

function handleLogging() {
  if (process.argv.includes('--debug'))
    console.debug('Debug logging enabled')
  else
    console.debug = () => { /* no-op */ }
}

async function handleInit() {
  if (process.argv[2] === 'init') {
    await runInit()
    process.exit(0)
  }
  if (!await configExists()) {
    console.info('No config file found. Running "secure-claude init" to create one...')
    await runInit()
  }
}

async function handleRegeneration(config: SecureClaudeConfig) {
  const needsRecreation = await needsRegeneration(config.tmpFolder, config.configPath)
  if (!needsRecreation) return
  await recreate(config)
}

async function runClaude(config: SecureClaudeConfig) {
  const args = [
    'compose', 'run', '--quiet', '--rm', 'claude',
    '--mcp-config', path.join(config.tmpFolder, 'mcp-config.json'),
    '--append-system-prompt-file', path.join(config.tmpFolder, 'system-prompt.txt'),
    '--strict-mcp-config',
    '--no-chrome',
    ...process.argv.slice(2),
  ]
  console.debug('Starting Claude container using ' + ['docker', ...args].join(' ') + ' in ' + config.tmpFolder)
  const claude = spawn('docker', args, { cwd: config.tmpFolder, stdio: 'inherit' })
  return new Promise<void>((resolve, reject) => {
    claude.on('error', (err) => { reject(new Error(`Failed to start Claude process: ${err.message}`)) })
    claude.on('close', (code) => {
      if (code === null || code !== 0) reject(new Error(`Claude process exited with code ${code?.toString() ?? 'unknown'}`))
      else resolve()
    })
  })
}

function handleError(err: unknown) {
  console.error(err)
  process.exit(1)
}
