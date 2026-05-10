#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version, name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

let failed = false

// Check if version is already published on npm
try {
  const res = await fetch(`https://registry.npmjs.org/${name}/${version}`)
  if (res.ok) {
    console.error(`✗ Version ${version} is already published on npm.`)
    failed = true
  }
  else if (res.status === 404) {
    console.log(`✓ Version ${version} is not yet published on npm.`)
  }
  else {
    console.error(`✗ Unexpected response from npm registry: ${res.status}`)
    failed = true
  }
}
catch (err) {
  console.error(`✗ Failed to reach npm registry: ${err.message}`)
  failed = true
}

// Check that RELEASE_NOTES.md contains a section for the current version
try {
  const notes = readFileSync(join(root, 'RELEASE_NOTES.md'), 'utf8')
  const heading = `## ${version}`
  if (notes.includes(heading)) {
    console.log(`✓ RELEASE_NOTES.md contains a section for ${version}.`)
  }
  else {
    console.error(`✗ RELEASE_NOTES.md does not contain a section for ${version} (expected "${heading}").`)
    failed = true
  }
}
catch (err) {
  console.error(`✗ Could not read RELEASE_NOTES.md: ${err.message}`)
  failed = true
}

if (failed) process.exit(1)
