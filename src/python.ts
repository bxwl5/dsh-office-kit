import type { ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Minimum interpreter minor version this plugin supports. */
export const MIN_PYTHON = 10
/** First unsupported interpreter minor version (wheel availability is the reason). */
export const MAX_PYTHON_EXCLUSIVE = 14
/** Python packages the helper CLI needs. */
export const PYTHON_PACKAGES = [
  { importName: 'docx', package: 'python-docx' },
  { importName: 'openpyxl', package: 'openpyxl' },
  { importName: 'pptx', package: 'python-pptx' },
  { importName: 'pypdf', package: 'pypdf' },
  { importName: 'reportlab', package: 'reportlab' },
  { importName: 'pdfplumber', package: 'pdfplumber' },
  { importName: 'pymupdf', package: 'pymupdf' },
  { importName: 'PIL', package: 'pillow' },
  { importName: 'latex2mathml', package: 'latex2mathml' },
  { importName: 'mathml2omml', package: 'mathml2omml' },
] as const

/** Absolute paths this plugin owns inside a user profile. */
export interface OfficePaths {
  readonly configFile: string
  readonly dataDir: string
  readonly cli: string
  readonly skillsDir: string
}

/** Resolve per-OS config/data directories and bundled resources. */
export function officePaths(): OfficePaths {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url))
  const home = homedir()
  const configDir = process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'dsh-office-suite')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'dsh-office-suite')
      : join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'dsh-office-suite')
  const dataDir = process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'dsh-office-suite')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'dsh-office-suite')
      : join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'dsh-office-suite')
  return {
    configFile: join(configDir, 'config.json'),
    dataDir,
    cli: join(packageRoot, 'python', 'office_cli.py'),
    skillsDir: join(packageRoot, 'assets', 'skills'),
  }
}

/** Result of inspecting one interpreter candidate. */
export interface PythonInspection {
  readonly path: string
  readonly version: string
  readonly major: number
  readonly minor: number
  readonly compatible: boolean
  readonly error?: string
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  }
  catch {
    return false
  }
}

function run(file: string, args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = execFile(file, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    }, (error, stdout) => {
      if (error != null) {
        reject(error)
        return
      }
      resolve(String(stdout).trim())
    })
    child.stdin?.end()
  })
}

const VERSION_SCRIPT = 'import json,sys;print(json.dumps({"version":sys.version.split()[0],"executable":sys.executable}))'

/** Inspect an absolute interpreter without trusting its path alone. */
export async function inspectPython(path: string): Promise<PythonInspection> {
  try {
    const raw = await run(path, ['-c', VERSION_SCRIPT])
    const parsed = JSON.parse(raw) as { version?: unknown, executable?: unknown }
    if (typeof parsed.version !== 'string' || typeof parsed.executable !== 'string')
      throw new Error('unexpected interpreter response')
    const [majorText, minorText] = parsed.version.split('.')
    const major = Number(majorText)
    const minor = Number(minorText)
    const compatible = major === 3 && minor >= MIN_PYTHON && minor < MAX_PYTHON_EXCLUSIVE
    return { path: parsed.executable, version: parsed.version, major, minor, compatible }
  }
  catch (error) {
    return {
      path,
      version: '',
      major: 0,
      minor: 0,
      compatible: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

interface SavedPython {
  readonly python?: unknown
  readonly version?: unknown
}

/** Read the interpreter path postinstall recorded; malformed files are ignored. */
function savedPython(configFile: string): string | undefined {
  if (!isFile(configFile))
    return undefined
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as SavedPython
    return typeof parsed.python === 'string' && parsed.python.length > 0 ? parsed.python : undefined
  }
  catch {
    return undefined
  }
}

/** PATH-independent candidate list, most specific first. */
function candidates(configFile: string): string[] {
  const found: string[] = []
  const env = process.env.DSH_OFFICE_PYTHON
  if (env != null && env.length > 0)
    found.push(env)
  const saved = savedPython(configFile)
  if (saved != null)
    found.push(saved)
  const marker = join(fileURLToPath(new URL('..', import.meta.url)), '.python-path')
  if (isFile(marker)) {
    const text = readFileSync(marker, 'utf8').trim()
    if (text.length > 0)
      found.push(text)
  }
  for (const name of ['python3', 'python'])
    found.push(name)
  if (process.platform === 'win32') {
    for (const version of ['3.13', '3.12', '3.11', '3.10'])
      found.push(`py -${version}`)
    found.push('py -3')
  }
  return [...new Set(found)]
}

/** Resolve the launcher (`py -3.12`) into the absolute interpreter it runs. */
async function expandLauncher(candidate: string): Promise<string[]> {
  if (!candidate.startsWith('py '))
    return [candidate]
  const args = candidate.split(' ').slice(1)
  try {
    const raw = await run('py', [...args, '-c', 'import sys;print(sys.executable)'])
    return raw.length > 0 ? [raw] : []
  }
  catch {
    return []
  }
}

/** Interpreters the Windows `py` launcher reports, including tagged (non-numeric) installs. */
async function launcherInterpreters(): Promise<string[]> {
  if (process.platform !== 'win32')
    return []
  try {
    const raw = await run('py', ['-0p'])
    return raw.split(/\r?\n/u).flatMap((line) => {
      const match = /^\s*-V:\S+\s+([A-Z]:\\[^\r\n]*python\.exe)\s*$/iu.exec(line)
      return match?.[1] != null ? [match[1]] : []
    })
  }
  catch {
    return []
  }
}

/** Find the first runnable, compatible interpreter; return the best attempt otherwise. */
export async function resolvePython(configFile = officePaths().configFile): Promise<PythonInspection | undefined> {
  let last: PythonInspection | undefined
  for (const candidate of [...candidates(configFile), ...await launcherInterpreters()]) {
    for (const expanded of await expandLauncher(candidate)) {
      if (expanded !== candidate && !isFile(expanded))
        continue
      const inspection = await inspectPython(expanded)
      if (inspection.compatible)
        return inspection
      last = inspection
    }
  }
  return last
}

/** Whether the helper CLI file shipped with this package. */
export function cliExists(): boolean {
  return isFile(officePaths().cli)
}
