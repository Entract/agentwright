// Copies the Pyodide runtime out of node_modules into public/pyodide so the
// app can load Python with no network access, and adds the Python packages
// listed in py-packages.json (the anthropic library and what it needs).
// The packages are downloaded once into vendor/pypackages and checked against
// their SHA-256 on every build.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'pyodide')
const to = join(root, 'public', 'pyodide')
const files = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

mkdirSync(to, { recursive: true })
for (const f of files) {
  if (!existsSync(join(from, f))) throw new Error(`Pyodide file missing: ${f}`)
  cpSync(join(from, f), join(to, f))
}

const { packages } = JSON.parse(readFileSync(join(root, 'scripts', 'py-packages.json'), 'utf8'))
const cache = join(root, 'vendor', 'pypackages')
const target = join(to, 'packages')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
mkdirSync(cache, { recursive: true })
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const { file, url, sha256: expected } of packages) {
  const cached = join(cache, file)
  if (!existsSync(cached) || sha256(cached) !== expected) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not download ${file}: HTTP ${response.status}`)
    writeFileSync(cached, Buffer.from(await response.arrayBuffer()))
    if (sha256(cached) !== expected) {
      rmSync(cached)
      throw new Error(`${file} does not match its expected SHA-256; refusing to bundle it.`)
    }
  }
  cpSync(cached, join(target, file))
}
writeFileSync(join(target, 'index.json'), JSON.stringify(packages.map((p) => p.file)))
console.log(`Copied ${files.length} Pyodide files and ${packages.length} Python packages to public/pyodide`)
