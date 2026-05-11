#!/usr/bin/env node
import * as fp from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = join(root, 'release-check-result.txt')
const packageJsonFile = join(root, 'package.json')

const { name, version } = getVersion()
if (!hasVersionChanged()) {
  console.log(`Version not changed in package.json, still ${version}`)
  writeOutput({ changed: false, version })
  process.exit(0)
}
console.log(`Version changed in package.json, new version is ${version}`)
checkReleaseNotes(version)
checkNotPublished(name, version)
  .then(() => writeOutput({ changed: true, version }))
  .catch(handleError)

function getVersion() {
  return JSON.parse(fp.readFileSync(packageJsonFile, 'utf8'))
}

function hasVersionChanged() {
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim()
  if (branch !== 'main') {
    spawnSync('git', ['fetch', 'origin', 'main'], { stdio: 'inherit' })
  }
  const baseRef = branch !== 'main' ? 'main' : 'HEAD~1'
  console.log(`Checking for version changes in package.json against ${baseRef}`)
  const diff = spawnSync('git', ['diff', baseRef, '--', 'package.json'], { encoding: 'utf8' })
  return diff.stdout.includes('"version"')
}

function checkReleaseNotes(version) {
  const releaseNotes = join(root, 'RELEASE_NOTES.md')
  const notes = fp.readFileSync(releaseNotes, 'utf8')
  if (!notes.includes(`## ${version}`)) {
    throw new Error(`RELEASE_NOTES.md does not contain a section for ${version} (expected "## ${version}").`)
  }
  console.log(`✓ RELEASE_NOTES.md contains a section for ${version}.`)
}

async function checkNotPublished(name, version) {
  return await fetch(`https://registry.npmjs.org/${name}/${version}`)
    .then((res) => {
      if (res.ok) {
        throw new Error(`Version ${version} is already published on npm.`)
      }
      if (res.status === 404) {
        console.log(`✓ Version ${version} is not yet published on npm.`)
        return
      }
      throw new Error(`✗ Unexpected response from npm registry: ${res.status}`)
    })
}

function writeOutput(result) {
  const output = Object.keys(result)
    .map(key => `${key}=${result[key]?.toString() ?? ''}`)
    .join('\n') + '\n'
  fp.writeFileSync(outputFile, output)
}

function handleError(err) {
  console.error(`✗ Error checking release: ${err.message}`)
  process.exit(1)
}
