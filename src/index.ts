import type { Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'
import type { RuntimeStatus } from './python'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { OFFICE_FEATURES } from './features'
import { cliExists, ensureRuntime, officePaths } from './python'

/** Services required by this host half. */
export const inject = ['skills', 'tools']

/** Cordis plugin identity used in loader diagnostics. */
export const name = 'dsh-office-kit'

const PROVIDER_NAME = 'dsh-office-kit'

interface ParsedSkill {
  readonly description: string
  readonly content: string
}

function parseSkill(raw: string, path: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match?.[1] == null)
    throw new Error(`dsh-office-kit: ${path} has no YAML frontmatter`)
  const description = /^description:(.*)$/mu.exec(match[1])?.[1]?.trim()
  if (description == null || description.length === 0)
    throw new Error(`dsh-office-kit: ${path} has no description`)
  return {
    description: description.replace(/^["']|["']$/gu, ''),
    content: raw.slice(match[0].length).trim(),
  }
}

interface RendererFacts {
  readonly libreoffice: string | null
  readonly microsoftOffice: {
    readonly word: boolean
    readonly powerpoint: boolean
    readonly excel: boolean
  }
  readonly kingsoftWps: {
    readonly writer: boolean
    readonly presentation: boolean
    readonly spreadsheet: boolean
  }
}

function findFile(candidates: readonly string[]): string | null {
  for (const path of candidates) {
    if (existsSync(path))
      return path
  }
  return null
}

const WPS_BINARIES = { writer: 'wps.exe', presentation: 'wpp.exe', spreadsheet: 'et.exe' } as const
const WPS_ROOTS = [
  process.env.WPS_OFFICE_HOME ?? '',
  'C:\\Program Files\\Kingsoft\\WPS Office',
  'C:\\Program Files (x86)\\Kingsoft\\WPS Office',
  join(process.env.LOCALAPPDATA ?? '', 'Kingsoft', 'WPS Office'),
].filter(Boolean)

function wpsInstalled(binary: string): boolean {
  for (const root of WPS_ROOTS) {
    if (existsSync(join(root, 'office6', binary)))
      return true
    try {
      for (const version of readdirSync(root)) {
        if (existsSync(join(root, version, 'office6', binary)))
          return true
      }
    }
    catch {
      // A missing or unreadable WPS root is simply not an installation.
    }
  }
  return false
}

function rendererFacts(): RendererFacts {
  const libreoffice = findFile([
    process.env.SOFFICE ?? '',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
  ].filter(Boolean))
  const officeRoots = [
    'C:\\Program Files\\Microsoft Office\\root\\Office16',
    'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16',
  ]
  return {
    libreoffice,
    microsoftOffice: {
      word: officeRoots.some(root => existsSync(join(root, 'WINWORD.EXE'))),
      powerpoint: officeRoots.some(root => existsSync(join(root, 'POWERPNT.EXE'))),
      excel: officeRoots.some(root => existsSync(join(root, 'EXCEL.EXE'))),
    },
    kingsoftWps: {
      writer: wpsInstalled(WPS_BINARIES.writer),
      presentation: wpsInstalled(WPS_BINARIES.presentation),
      spreadsheet: wpsInstalled(WPS_BINARIES.spreadsheet),
    },
  }
}

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

function pluginVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  }
  catch {
    return 'unknown'
  }
}

/** Human-readable reason for a runtime that failed verification. */
function runtimeReason(runtime: RuntimeStatus): string {
  if (runtime.state === 'missing-dependencies') {
    const names = runtime.missing.map(entry => entry.package).join(', ')
    return `Python ${runtime.python?.version ?? ''} is installed but missing packages: ${names}`.replace('  ', ' ')
  }
  return 'no compatible Python 3.10–3.13 interpreter was found'
}

/** Register the four skills and a status tool, and expose the runtime paths in skill bodies. */
export function apply(ctx: Context): void {
  const paths = officePaths()
  const candidates: SkillCandidate[] = []

  for (const feature of OFFICE_FEATURES) {
    const directory = join(paths.skillsDir, feature.skill)
    const path = join(directory, 'SKILL.md')
    if (!existsSync(path)) {
      // Registration must not fail the whole plugin because one pack is missing.
      console.warn(`[dsh-office-kit] missing skill file: ${path}`)
      continue
    }
    const candidate: SkillCandidate = {
      name: feature.skill,
      description: feature.description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: PROVIDER_NAME,
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory.split('\\').join('/') },
      locator: path,
      path,
    }
    candidates.push(candidate)
  }

  const provider: SkillProvider = {
    name: PROVIDER_NAME,
    list: () => Promise.resolve(candidates),
    async get(candidate: SkillCandidate, options): Promise<SkillDefinition | undefined> {
      if (!candidates.includes(candidate))
        return undefined
      const path = String(candidate.locator)
      let raw: string
      try {
        raw = await readFile(path, { encoding: 'utf8', signal: options.signal })
      }
      catch {
        return undefined
      }
      const parsed = parseSkill(raw, path)
      const runtime = await ensureRuntime(paths.configFile)
      const pythonLine = runtime.state === 'ok' && runtime.python != null
        ? `\n\n## Office runtime\n\nUse these verified absolute paths for every helper command. Quote paths that contain spaces. \`skill\` is this skill's own directory: every script it names lives at \`<skill>/scripts/...\`; \`shared\` holds the cross-format workflow notes.\n\n\`\`\`json\n${JSON.stringify({ python: runtime.python.path, cli: paths.cli, skill: dirname(path).split('\\').join('/'), shared: join(paths.skillsDir, 'shared').split('\\').join('/'), version: runtime.python.version }, null, 2)}\n\`\`\``
        : `\n\n## Office runtime\n\nNo working Python runtime is available: ${runtimeReason(runtime)}. Do not run helper commands or claim success. Tell the user to run \`${runtime.remedy}\`, then call \`office_status\` again.`
      const { rank: _rank, locator: _locator, ...summary } = candidate
      return {
        ...summary,
        description: parsed.description,
        content: parsed.content + pythonLine,
      }
    },
  }

  ctx.effect(() => ctx.skills.registerProvider(() => provider), 'office-suite: skills')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'office_status',
    description: 'Report the Office runtime state: compatible Python, installed Python packages, helper CLI path, and document renderers (LibreOffice, Microsoft Office, or WPS Office). Call this before Office file work.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    timeoutMs: 600_000,
    async execute() {
      // An explicit status check must never report a cached runtime that has since disappeared.
      const runtime = await ensureRuntime(paths.configFile, true)
      const report = {
        plugin: { name, version: pluginVersion() },
        runtime: {
          state: runtime.state,
          venv: paths.venv,
          ...(runtime.state === 'ok' ? {} : { reason: runtimeReason(runtime), remedy: runtime.remedy }),
          ...(runtime.error == null ? {} : { error: runtime.error }),
          ...(runtime.heal == null ? {} : { heal: runtime.heal }),
        },
        python: runtime.python == null
          ? { found: false }
          : {
              found: true,
              path: runtime.python.path,
              version: runtime.python.version,
              compatible: runtime.python.compatible,
              ...(runtime.python.error == null ? {} : { error: runtime.python.error }),
            },
        cli: { path: paths.cli, exists: cliExists() },
        packages: runtime.packages,
        renderers: rendererFacts(),
        skills: candidates.map(candidate => candidate.name),
      }
      return JSON.stringify(report, null, 2)
    },
  })), 'office-suite: status tool')
}
