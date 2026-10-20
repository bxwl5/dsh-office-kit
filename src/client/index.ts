import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { OfficeFeatureId } from '../features'
import { rankByName } from '@deepseek-ai/dsh-client-ui-primitives'
import { featureByCommand, featureById, OFFICE_FEATURES } from '../features'
import { OFFICE_CHIP, OFFICE_CHIP_SLOT, OFFICE_NS, OFFICE_SOURCE } from './constants'
import { OFFICE_ICONS } from './icons'
import { OfficeReference } from './office-reference'
import { mountOfficeStyles } from './styles'

/** Client services used by this half. */
export const inject = [
  'inputTriggers',
  'sessions',
  'slots',
  'locale',
  'remote',
  'remote.skills',
  'sidebarRight',
  'uiConversation',
]

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

const zh = {
  'menu.documents.label': '文档',
  'menu.documents.description': '创建、读取、编辑和渲染 DOCX 文档',
  'menu.pdf.label': 'PDF 文档',
  'menu.pdf.description': '读取、创建、检查、渲染和验证 PDF',
  'menu.presentations.label': '演示文稿',
  'menu.presentations.description': '创建、编辑、渲染和导出 PPTX 演示文稿',
  'menu.spreadsheets.label': '电子表格',
  'menu.spreadsheets.description': '创建、编辑、计算和导出 XLSX 电子表格',
} as const

const en: Record<keyof typeof zh, string> = {
  'menu.documents.label': 'Documents',
  'menu.documents.description': 'Create, read, edit, and render DOCX documents',
  'menu.pdf.label': 'PDF documents',
  'menu.pdf.description': 'Read, create, inspect, render, and verify PDFs',
  'menu.presentations.label': 'Presentations',
  'menu.presentations.description': 'Create, edit, render, and export PPTX decks',
  'menu.spreadsheets.label': 'Spreadsheets',
  'menu.spreadsheets.description': 'Create, edit, calculate, and export XLSX workbooks',
}

interface OfficeSkillSummary {
  readonly name: string
  readonly path?: string
}

interface CatalogEntry {
  readonly abort: AbortController
  readonly promise: Promise<readonly OfficeSkillSummary[]>
  settled?: readonly OfficeSkillSummary[]
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/')
}

function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`
}

function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/u, '') ?? ''
  if (!/^(?:\/|[A-Za-z]:\/|\\\\)/u.test(normalized))
    return sessionFileAddress(sessionId, normalized)
  if (root !== '' && normalized.startsWith(`${root}/`))
    return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
  return sessionFileAddress(sessionId, normalized)
}

interface OfficeSkillCatalog {
  list: (input: { sessionId: string }, signal?: AbortSignal) => Promise<
    | { ok: true, value: { skills: readonly OfficeSkillSummary[] } }
    | { ok: false, error: { code: string, message: string } }
  >
}

interface OfficeSessionReference {
  readonly binding: {
    readonly session: {
      getSnapshot: () => { openState: string, openError?: Error }
    }
  }
}

/**
 * The small public Session face this client needs. The installed DSH assembly
 * also ships a host `dsh-session` augmentation that widens `ctx.sessions` with
 * an incompatible `SessionStore`, so narrow through the documented client face.
 */
interface OfficeSessions {
  binding: (sessionId: string) => unknown
  using: <T>(
    sessionId: string,
    options: { source: string, signal: AbortSignal },
    fn: (reference: OfficeSessionReference) => Promise<T>,
  ) => Promise<T>
  list: {
    getSnapshot: () => { byId: Record<string, { cwd?: string } | undefined> }
  }
}

/** Register the `/` source, transcript chip, and right-sidebar preview. */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as OfficeSessions
  const remoteSkills = (ctx.remote as unknown as { skills: OfficeSkillCatalog }).skills
  const t = ctx.locale.bind(OFFICE_NS)
  const entries = new Map<string, CatalogEntry>()

  ctx.effect(() => mountOfficeStyles(), 'office-suite: styles')
  ctx.effect(() => ctx.locale.register(OFFICE_NS, { zh, en }), 'office-suite: dictionaries')

  function catalogFor(sessionId: string): CatalogEntry {
    const existing = entries.get(sessionId)
    if (existing !== undefined)
      return existing

    const abort = new AbortController()
    const promise = (async () => {
      if (sessions.binding(sessionId) === undefined)
        throw new Error(`office catalog requires a retained session "${sessionId}"`)
      return sessions.using(sessionId, { source: 'officeCatalog', signal: abort.signal }, async (reference) => {
        abort.signal.throwIfAborted()
        const state = reference.binding.session.getSnapshot()
        if (state.openState !== 'open')
          throw state.openError ?? new Error(`session "${sessionId}" is not open`)
        const result = await remoteSkills.list({ sessionId }, abort.signal)
        abort.signal.throwIfAborted()
        if (!result.ok)
          throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`)
        return result.value.skills
      })
    })()

    const entry: CatalogEntry = { abort, promise }
    entries.set(sessionId, entry)
    promise.then((skills) => {
      entry.settled = skills
    }, () => {
      if (entries.get(sessionId) === entry)
        entries.delete(sessionId)
    })
    return entry
  }

  function openSkill(sessionId: string, feature: OfficeFeatureId, catalog: readonly OfficeSkillSummary[]): boolean {
    const definition = featureById(feature)
    if (definition === undefined)
      return false
    const skill = catalog.find(item => item.name === definition.skill)
    if (skill?.path === undefined)
      return false
    const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
    try {
      ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, skill.path))
      return true
    }
    catch (error) {
      console.error('[dsh-office-suite] reference preview failed:', error)
      return false
    }
  }

  const source: InputTriggerSource = {
    trigger: '/',
    name: OFFICE_SOURCE,
    order: 1,
    async candidates(_session, { query, signal }) {
      if (signal.aborted)
        return []
      const items = OFFICE_FEATURES.map((feature) => {
        const Icon = OFFICE_ICONS[feature.id]
        return {
          name: feature.command,
          label: t(`menu.${feature.id}.label`),
          description: t(`menu.${feature.id}.description`),
          icon: Icon,
        }
      })
      return query.length === 0 ? items : rankByName(items, query)
    },
    lexicon() {
      return OFFICE_FEATURES.map(feature => feature.command)
    },
    openReference(session, { ref }) {
      const feature = featureById(ref)
      if (feature === undefined)
        return false

      const settled = entries.get(session.sessionId)?.settled
      if (settled !== undefined)
        return openSkill(session.sessionId, feature.id, settled)

      const entry = catalogFor(session.sessionId)
      entry.promise.then((catalog) => {
        if (!entry.abort.signal.aborted)
          openSkill(session.sessionId, feature.id, catalog)
      }).catch((error) => {
        if (!entry.abort.signal.aborted)
          console.error('[dsh-office-suite] reference preview failed:', error)
      })
      return true
    },
    onPick({ candidate }) {
      const feature = featureByCommand(candidate.name)
      if (feature === undefined)
        return undefined
      return {
        insert: {
          source: OFFICE_SOURCE,
          ref: feature.id,
          label: t(`menu.${feature.id}.label`),
          appearance: 'file',
          clipboardText: `/${feature.command}`,
        },
      }
    },
    codec: {
      clipboardText(ref) {
        const feature = featureById(ref)
        return feature === undefined ? `/${ref}` : `/${feature.command}`
      },
      async serialize(ref) {
        const feature = featureById(ref)
        if (feature === undefined)
          return '/documents'
        return `/${feature.command}\n\nUse the "${feature.skill}" skill for this request and follow its instructions before creating, editing, or rendering files.`
      },
    },
  }

  const rule: UserTextRule<'office'> = {
    id: OFFICE_CHIP,
    order: 20,
    match(text, from) {
      const tokens = /(?<!\S)\/([\w-]+)(?!\S)/gu
      tokens.lastIndex = from
      for (let token = tokens.exec(text); token !== null; token = tokens.exec(text)) {
        const feature = featureByCommand(token[1] ?? '')
        if (feature === undefined)
          continue
        return {
          id: OFFICE_CHIP,
          start: token.index,
          end: token.index + token[0].length,
          data: { feature: feature.id },
        }
      }
      return undefined
    },
  }

  ctx.effect(() => ctx.uiConversation.userText.register(rule), 'office-suite: transcript chip')

  ctx.effect(() => ctx.slots.inject(OFFICE_CHIP_SLOT, () => ctx.slots.register({
    name: OFFICE_CHIP_SLOT,
    key: OFFICE_CHIP,
    priority: 100,
    inject: (sessionId: string) => ({
      openOffice: (feature: OfficeFeatureId) => {
        source.openReference?.({ sessionId: sessionId as never }, { ref: feature, appearance: 'file' })
      },
      officeLabel: (feature: OfficeFeatureId) => t(`menu.${feature}.label`),
    }),
  }, OfficeReference)), 'office-suite: transcript chip slot')

  const inputTriggers = ctx.inputTriggers
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      for (const entry of entries.values())
        entry.abort.abort()
      entries.clear()
    }
  }, 'office-suite: slash source')
}
