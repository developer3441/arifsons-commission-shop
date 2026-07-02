#!/usr/bin/env node
// Docs-lint — mechanical SSOT checks for the docs system. No LLM, no deps.
// Enforces what /audit would otherwise check by hand: refs resolve, index
// matches reality, required files exist, always-on context stays wired.
// Exit 1 on any finding; run via `npm run docs:lint` (also a CI job).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const findings = []
const fail = (file, msg) => findings.push({ file, msg })
const read = (p) => readFileSync(join(root, p), 'utf8')
const exists = (p) => existsSync(join(root, p))

// ---------- A. Required files ----------
for (const f of ['CLAUDE.md', 'CONTEXT.md', 'docs/architecture.md', 'docs/adr/README.md']) {
  if (!exists(f)) fail(f, 'required file missing')
}

const ADR_DIR = 'docs/adr'
const adrFiles = exists(ADR_DIR)
  ? readdirSync(join(root, ADR_DIR)).filter((f) => /^\d{4}-.+\.md$/.test(f))
  : []
if (!adrFiles.some((f) => f.startsWith('0000-'))) fail(ADR_DIR, 'ADR-0000 (conventions) missing')

if (exists('docs/architecture.md') && !read('docs/architecture.md').includes('Delivery boundary:')) {
  fail('docs/architecture.md', 'missing the load-bearing "Delivery boundary:" line')
}

const codeLanded = exists('backend/src') || exists('src')
if (codeLanded) {
  if (!exists('README.md')) fail('README.md', 'code has landed but README.md is missing')
  if (!exists('.github/workflows')) fail('.github/workflows', 'code has landed but there is no CI workflow')
}

// ---------- ADR status map (from each file's banner) ----------
const statusOf = {}
for (const f of adrFiles) {
  const m = read(join(ADR_DIR, f)).match(/\*\*Status:\*\*\s*([^·\n]+)/)
  if (!m) fail(`${ADR_DIR}/${f}`, 'no "**Status:**" banner')
  statusOf[f.slice(0, 4)] = (m ? m[1] : 'unknown').replace(/\[.*$/, '').trim().toLowerCase()
}

// ---------- B + C. Every ADR-XXXX ref resolves; prose never follows a superseded ADR ----------
function mdFilesUnder(dir) {
  const out = []
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry)
    if (statSync(join(root, rel)).isDirectory()) out.push(...mdFilesUnder(rel))
    else if (entry.endsWith('.md')) out.push(rel)
  }
  return out
}

const allDocs = ['CLAUDE.md', 'CONTEXT.md', ...(exists('docs') ? mdFilesUnder('docs') : [])].filter(exists)
for (const file of allDocs) {
  const insideAdrDir = file.startsWith(ADR_DIR) // cross-ADR refs & the index may cite superseded ADRs (history/redirects)
  for (const [, num] of read(file).matchAll(/ADR-(\d{4})/g)) {
    if (!(num in statusOf)) fail(file, `cites ADR-${num} but no such file exists in ${ADR_DIR}/`)
    else if (!insideAdrDir && statusOf[num].startsWith('superseded'))
      fail(file, `cites ADR-${num}, which is ${statusOf[num]} — repoint to the superseding ADR`)
  }
}

// ---------- D. Index ↔ files consistency ----------
if (exists(`${ADR_DIR}/README.md`)) {
  const indexRows = {}
  for (const line of read(`${ADR_DIR}/README.md`).split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length >= 5 && /^\d{4}$/.test(cells[1])) indexRows[cells[1]] = cells[4].toLowerCase()
  }
  for (const f of adrFiles) {
    const num = f.slice(0, 4)
    if (!(num in indexRows)) fail(`${ADR_DIR}/README.md`, `no index row for ${f}`)
    else if (indexRows[num].split(' ')[0] !== statusOf[num].split(' ')[0])
      fail(`${ADR_DIR}/README.md`, `index says ${num} is "${indexRows[num]}" but the file's banner says "${statusOf[num]}"`)
  }
  for (const num of Object.keys(indexRows)) {
    if (!(num in statusOf)) fail(`${ADR_DIR}/README.md`, `index row ${num} has no matching file in ${ADR_DIR}/`)
  }
}

// ---------- E. Every landmine in always-on context cites its ADR ----------
if (exists('CONTEXT.md')) {
  const lines = read('CONTEXT.md').split('\n')
  const start = lines.findIndex((l) => /^##.*Landmines/i.test(l))
  if (start === -1) fail('CONTEXT.md', 'no "## Landmines" section')
  else
    for (const l of lines.slice(start)) {
      if (l.startsWith('- ') && !/ADR-\d{4}/.test(l)) fail('CONTEXT.md', `landmine cites no ADR: "${l.slice(0, 60)}…"`)
    }
}

// ---------- F. Glossary open-question flags on already-settled ADRs ----------
if (exists('docs/glossary.md')) {
  for (const line of read('docs/glossary.md').split('\n')) {
    if (!line.includes('🟡')) continue
    for (const [, num] of line.matchAll(/ADR-(\d{4})/g)) {
      if (statusOf[num] === 'accepted')
        fail('docs/glossary.md', `🟡 open-question flag cites ADR-${num}, which is accepted — flip the flag`)
    }
  }
}

// ---------- Report ----------
if (findings.length) {
  console.error(`docs-lint: ${findings.length} finding(s)\n`)
  for (const { file, msg } of findings) console.error(`  ✗ ${file} — ${msg}`)
  console.error('\nFix at the source, never patch a copy (see docs/adr/0000-* §6).')
  process.exit(1)
}
console.log(`docs-lint: OK (${adrFiles.length} ADRs, ${allDocs.length} docs checked)`)
