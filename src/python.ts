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

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const POSTINSTALL_SCRIPT = join(PACKAGE_ROOT, 'postinstall.mjs')
/** Upper bound for one self-heal run; the remedy command remains available afterwards. */
const POSTINSTALL_TIMEOUT = 9 * 60 * 1000
/** Failed probes are retried after this delay instead of re-running pip on every status call. */
const FAILURE_RETRY_DELAY = 5 * 60 * 1000

/** Absolute paths this plugin owns inside a user profile. */
export interface OfficePaths {
  readonly configFile: string
  readonly venv: string
  readonly legacyVenv: string
  readonly cli: string
  readonly skillsDir: string
}

function configDir(): string {
  const home = homedir()
  return process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'dsh-office-kit')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'dsh-office-kit')
      : join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'dsh-office-kit')
}

function legacyDataDir(): string {
  const home = homedir()
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'dsh-office-kit')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'dsh-office-kit')
      : join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'dsh-office-kit')
}

/** Resolve per-OS config/data directories and bundled resources. */
export function officePaths(): OfficePaths {
  const runtimeDir = join(homedir(), '.dsh', 'office', 'runtime')
  return {
    configFile: join(configDir(), 'config.json'),
    venv: join(runtimeDir, 'venv'),
    legacyVenv: join(legacyDataDir(), 'venv'),
    cli: join(PACKAGE_ROOT, 'python', 'office_cli.py'),
    skillsDir: join(PACKAGE_ROOT, 'assets', 'skills'),
  }
}

/** One required Python package as reported by the interpreter itself. */
export interface PackageState {
  readonly package: string
  readonly importName: string
  readonly installed: boolean
  readonly version?: string
  readonly error?: string
}

/** Result of inspecting one interpreter candidate. */
export interface PythonInspection {
  readonly path: string
  readonly version: string
  readonly major: number
  readonly minor: number
  readonly compatible: boolean
  readonly packages: readonly PackageState[]
  readonly missing: readonly PackageState[]
  readonly error?: string
}

/** Three-state runtime answer: ready, interpreter without dependencies, or nothing usable. */
export type RuntimeState = 'ok' | 'missing-dependencies' | 'no-interpreter'

/** Outcome of the last self-heal attempt. */
export interface RuntimeHeal {
  readonly attempted: boolean
  readonly error?: string
}

/** Everything the host half and the status tool need to know about the runtime. */
export interface RuntimeStatus {
  readonly state: RuntimeState
  readonly python?: PythonInspection
  readonly packages: readonly PackageState[]
  readonly missing: readonly PackageState[]
  readonly remedy: string
  readonly heal?: RuntimeHeal
  readonly error?: string
}

/** One-liner the user can run to repair the runtime without pnpm. */
export function runtimeRemedy(): string {
  return `node "${POSTINSTALL_SCRIPT}"`
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

const RUNTIME_SCRIPT = `
import importlib, json, sys
targets = ${JSON.stringify(PYTHON_PACKAGES)}
packages = {}
for item in targets:
    try:
        module = importlib.import_module(item["importName"])
        packages[item["package"]] = {"installed": True, "version": str(getattr(module, "__version__", ""))}
    except Exception as exc:
        packages[item["package"]] = {"installed": False, "error": f"{type(exc).__name__}: {exc}"}
print(json.dumps({"python": sys.executable, "version": sys.version.split()[0], "packages": packages}))
`.trim()

interface RuntimeProbePayload {
  readonly python?: unknown
  readonly version?: unknown
  readonly packages?: Record<string, { installed?: unknown, version?: unknown, error?: unknown }>
}

/** Inspect an absolute interpreter: version plus every required import. */
export function inspectPython(path: string): Promise<PythonInspection> {
  return run(path, ['-c', RUNTIME_SCRIPT], 60_000).then((raw) => {
    try {
      const parsed = JSON.parse(raw) as RuntimeProbePayload
      if (typeof parsed.version !== 'string' || typeof parsed.python !== 'string')
        throw new Error('unexpected interpreter response')
      const [majorText, minorText] = parsed.version.split('.')
      const major = Number(majorText)
      const minor = Number(minorText)
      const incompatible = major !== 3 || minor < MIN_PYTHON || minor >= MAX_PYTHON_EXCLUSIVE
      const packages: PackageState[] = PYTHON_PACKAGES.map(({ importName, package: name }) => {
        const entry = parsed.packages?.[name]
        const installed = entry?.installed === true
        return {
          package: name,
          importName,
          installed,
          ...(typeof entry?.version === 'string' && entry.version.length > 0 ? { version: entry.version } : {}),
          ...(typeof entry?.error === 'string' && entry.error.length > 0 ? { error: entry.error } : {}),
        }
      })
      const missing = packages.filter(entry => !entry.installed)
      const inspection: PythonInspection = {
        path: parsed.python,
        version: parsed.version,
        major,
        minor,
        compatible: !incompatible,
        packages,
        missing: incompatible ? [] : missing,
      }
      return incompatible
        ? { ...inspection, error: `unsupported Python ${parsed.version}` }
        : inspection
    }
    catch (error) {
      return failedInspection(path, error)
    }
  }, error => failedInspection(path, error))
}

function failedInspection(path: string, error: unknown): PythonInspection {
  return {
    path,
    version: '',
    major: 0,
    minor: 0,
    compatible: false,
    packages: [],
    missing: [],
    error: error instanceof Error ? error.message : String(error),
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

/** PATH-independent candidate list, plugin-owned interpreters first. */
function candidates(configFile: string): string[] {
  const paths = officePaths()
  const found: string[] = []
  const env = process.env.DSH_OFFICE_PYTHON
  if (env != null && env.length > 0)
    found.push(env)
  const saved = savedPython(configFile)
  if (saved != null)
    found.push(saved)
  found.push(paths.venv, paths.legacyVenv)
  const marker = join(PACKAGE_ROOT, '.python-path')
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

function statusOf(python: PythonInspection): RuntimeStatus {
  const ready = python.compatible && python.missing.length === 0
  return {
    state: ready ? 'ok' : 'missing-dependencies',
    python,
    packages: python.packages,
    missing: python.missing,
    remedy: runtimeRemedy(),
  }
}

/** Inspect every candidate; return the first interpreter that proves it has all dependencies. */
export async function inspectRuntime(configFile = officePaths().configFile): Promise<RuntimeStatus> {
  let compatible: PythonInspection | undefined
  let last: PythonInspection | undefined
  for (const candidate of [...candidates(configFile), ...await launcherInterpreters()]) {
    for (const expanded of await expandLauncher(candidate)) {
      if (expanded !== candidate && !isFile(expanded))
        continue
      const inspection = await inspectPython(expanded)
      if (inspection.compatible && inspection.missing.length === 0)
        return statusOf(inspection)
      if (inspection.compatible && compatible == null)
        compatible = inspection
      last = inspection
    }
  }
  if (compatible != null)
    return statusOf(compatible)
  return {
    state: 'no-interpreter',
    packages: [],
    missing: [],
    remedy: runtimeRemedy(),
    ...(last?.error == null ? {} : { error: last.error }),
  }
}

/** Run postinstall.mjs as a child process; resolve with an error summary or undefined. */
function runPostinstall(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(process.execPath, [POSTINSTALL_SCRIPT], {
      timeout: POSTINSTALL_TIMEOUT,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        // The host may run inside CI-like environments where postinstall opts out.
        DSH_OFFICE_POSTINSTALL: '1',
      },
    }, (error, stdout, stderr) => {
      if (error == null) {
        resolve(undefined)
        return
      }
      const detail = String(stderr || stdout || error.message).trim().split(/\r?\n/u).slice(-6).join('\n')
      resolve(detail.length > 0 ? detail : error.message)
    })
  })
}

interface RuntimeCache {
  readonly status: RuntimeStatus
  readonly at: number
}

let cache: RuntimeCache | undefined
let healing: Promise<RuntimeStatus> | undefined

/** A cached `ok` is only worth reusing while its interpreter still exists on disk. */
export function runtimeAlive(status: RuntimeStatus): boolean {
  return status.state !== 'ok' || (status.python != null && isFile(status.python.path))
}

/**
 * Resolve a runtime that is proven to work, self-healing via postinstall.mjs when it
 * is missing or incomplete. Never returns a bare interpreter without dependencies.
 * Pass `force` for an explicit status check that must not trust the process cache.
 */
export function ensureRuntime(configFile = officePaths().configFile, force = false): Promise<RuntimeStatus> {
  if (!force && cache != null) {
    const reusable = cache.status.state === 'ok' ? runtimeAlive(cache.status) : Date.now() - cache.at < FAILURE_RETRY_DELAY
    if (reusable)
      return Promise.resolve(cache.status)
  }
  healing ??= (async (): Promise<RuntimeStatus> => {
    const probed = await inspectRuntime(configFile)
    if (probed.state === 'ok') {
      cache = { status: probed, at: Date.now() }
      return probed
    }
    const healError = await runPostinstall()
    const after = await inspectRuntime(configFile)
    const status: RuntimeStatus = { ...after, heal: { attempted: true, ...(healError == null ? {} : { error: healError }) } }
    cache = { status, at: Date.now() }
    return status
  })().finally(() => {
    healing = undefined
  })
  return healing
}

/** Whether the helper CLI file shipped with this package. */
export function cliExists(): boolean {
  return isFile(officePaths().cli)
}
