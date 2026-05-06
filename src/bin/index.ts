#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { loadConfig, SecureClaudeConfig } from './config.js'
import { needsRegeneration } from './needsRegeneration.js'
import { runInit } from './init.js'
import { recreate } from './recreate.js'

main().catch(handleError)

async function main() {
  handleLogging()
  await handleInit()
  const config = await loadConfig()
  await handleRegeneration(config)
  await runClaude(config)
}

function handleLogging() {
  if (process.argv.includes('--debug'))
    console.debug('Debug logging enabled')
  else
    console.debug = () => { /* no-op */ }
}

async function handleInit() {
  if (process.argv[2] !== 'init') return
  await runInit()
  process.exit(0)
}

async function handleRegeneration(config: SecureClaudeConfig) {
  const needsRecreation = await needsRegeneration(config.tmpFolder, config.configPath)
  if (!needsRecreation) return
  await recreate(config)
}

async function runClaude(config: SecureClaudeConfig) {
  const args = ['compose', 'run', '--quiet', '--rm', 'claude', ...process.argv.slice(2)]
  console.debug('Starting Claude container using ' + ['docker', ...args].join(' ') + ' in ' + config.tmpFolder)
  const claude = spawn('docker', args, { cwd: config.tmpFolder, stdio: 'pipe' })
  return new Promise<void>((resolve, reject) => {
    claude.stdout.on('data', (data: Buffer) => { console.debug('> ' + data.toString()) })
    claude.stderr.on('data', (data: Buffer) => { console.debug('! ' + data.toString()) })
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
