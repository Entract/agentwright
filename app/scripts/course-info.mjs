// Writes src/course/info.generated.json: which exercises have tests and what each one's
// workspace looks like, as reported by the course checker itself (labcheck.py info).
// The phone app reads it so an exercise can be shown before Python has started.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const curriculum = join(root, '..', 'desktop', 'curriculum')
const python = process.env.LAB_PYTHON ?? 'python'
const out = execFileSync(python, [join(curriculum, 'labcheck.py'), 'info'], {
  cwd: curriculum,
  encoding: 'utf8',
  env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
})
const { implemented, workspaces } = JSON.parse(out.trim().split('\n').pop())
writeFileSync(join(root, 'src', 'course', 'info.generated.json'), JSON.stringify({ implemented, workspaces }, null, 1) + '\n')
console.log(`Course info written: ${implemented.length} exercises, ${Object.keys(workspaces).length} with their own workspace`)
