import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { stackStateDir } from './lib.mjs'

/** Stops the dev-stack processes started by start.mjs. */

for (const name of ['gateway', 'postgrest']) {
  const pidPath = resolve(stackStateDir, `${name}.pid`)
  if (!existsSync(pidPath)) {
    console.log(`[dev-stack] ${name}: no pidfile`)
    continue
  }

  const pid = Number(readFileSync(pidPath, 'utf8').trim())

  try {
    process.kill(pid)
    console.log(`[dev-stack] ${name} stopped (pid ${pid})`)
  }
  catch {
    console.log(`[dev-stack] ${name}: process ${pid} was not running`)
  }

  rmSync(pidPath, { force: true })
}
