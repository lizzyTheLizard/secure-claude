#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { loadConfig, SecureClaudeConfig } from './config.js'
import { needsRegeneration } from './needsRegeneration.js'
import { runInit } from './init.js'
import { recreateFiles } from './recreate.js'

main().catch(handleError)

async function main() {
  await handleInit()
  const cwd = process.cwd()
  const config = loadConfig(cwd)
  await handleRegeneration(config).then(() => { runClaude(config) })
}

function handleError(err: unknown) {
  console.error(err)
  process.exit(1)
}

async function handleInit() {
  if (process.argv[2] !== 'init') return
  await runInit()
  process.exit(0)
}

async function handleRegeneration(config: SecureClaudeConfig) {
  if (needsRegeneration(config.tmpFolder, config.configPath)) {
    await recreateFiles(config)
  }
}

function runClaude(config: SecureClaudeConfig) {
  const noTTY = !process.stdout.isTTY
  const args = ['compose', 'run', '--rm', ...(noTTY ? ['-T'] : []), 'claude', ...process.argv.slice(2)]
  console.debug('Starting Claude container using ' + ['docker', ...args].join(' ') + ' in ' + config.tmpFolder)
  const result = spawnSync('docker', args, {
    cwd: config.tmpFolder,
    stdio: 'inherit',
  })

  if (result.error) {
    const msg = (result.error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'Docker not found — is it installed and on your PATH?'
      : `Failed to spawn docker: ${result.error.message}`
    console.error(msg)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}
