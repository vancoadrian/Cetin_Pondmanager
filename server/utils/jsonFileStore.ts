import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const fileMutexes = new Map<string, Promise<unknown>>()

/**
 * Serializes async operations that touch the same file path, so concurrent
 * read-modify-write sequences against one local JSON store can no longer
 * race and silently drop one side's write.
 */
export function withFileMutex<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = fileMutexes.get(filePath) ?? Promise.resolve()
  const run = previous.then(task, task)
  fileMutexes.set(filePath, run.then(() => undefined, () => undefined))
  return run
}

/**
 * Writes JSON to a temp file in the same directory and renames it into place,
 * so a crash or concurrent read never observes a partially written file.
 */
export async function atomicWriteJsonFile(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}
