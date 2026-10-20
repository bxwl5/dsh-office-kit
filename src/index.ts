import type { Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { OFFICE_FEATURES } from './features'
import { cliExists, officePaths, PYTHON_PACKAGES, resolvePython } from './python'

const execFileAsync = promisify(execFile)

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
}

function findFile(candidates: readonly string[]): string | null {
  for (const path of candidates) {
    if (existsSync(path))
      return path
  }
  return null
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
  }
}

const PACKAGE_PROBE = `
import importlib, json, sys
targets = ${JSON.stringify(PYTHON_PACKAGES)}
out = {}
for item in targets:
    try:
        module = importlib.import_module(item["importName"])
        out[item["package"]] = {"installed": True, "version": str(getattr(module, "__version__", ""))}
    except Exception as exc:
        out[item["package"]] = {"installed": False, "error": f"{type(exc).__name__}: {exc}"}
print(json.dumps({"python": sys.executable, "version": sys.version.split()[0], "packages": out}))
`.trim()

async function probePackages(python: string): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(python, ['-c', PACKAGE_PROBE], {
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return JSON.parse(String(stdout).trim())
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
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
      const python = await resolvePython(paths.configFile)
      const pythonLine = python?.compatible === true
        ? `\n\n## Office runtime\n\nUse these verified absolute paths for every helper command. Quote paths that contain spaces.\n\n\`\`\`json\n${JSON.stringify({ python: python.path, cli: paths.cli, version: python.version }, null, 2)}\n\`\`\``
        : '\n\n## Office runtime\n\nNo compatible Python was found. Ask the user to run `pnpm rebuild dsh-office-kit` (or `npm rebuild dsh-office-kit`) and check the install output before attempting file work.'
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
    description: 'Report the Office runtime state: compatible Python, installed Python packages, helper CLI path, and document renderers (LibreOffice or Microsoft Office). Call this before Office file work.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    timeoutMs: 45_000,
    async execute() {
      const python = await resolvePython(paths.configFile)
      const seen = await (python?.compatible === true ? probePackages(python.path) : Promise.resolve(null))
      const report = {
        plugin: { name, version: '0.1.0' },
        python: python == null
          ? { found: false }
          : {
              found: true,
              path: python.path,
              version: python.version,
              compatible: python.compatible,
              ...(python.error == null ? {} : { error: python.error }),
            },
        cli: { path: paths.cli, exists: cliExists() },
        packages: seen,
        renderers: rendererFacts(),
        skills: candidates.map(candidate => candidate.name),
      }
      return JSON.stringify(report, null, 2)
    },
  })), 'office-suite: status tool')
}
