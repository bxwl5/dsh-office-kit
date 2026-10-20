import type { OfficeFeatureId } from '../src/features'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { featureByCommand, featureById, OFFICE_FEATURES } from '../src/features'
import { officePaths } from '../src/python'

const isWindows = process.platform === 'win32'
const PACKAGE_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')

function configuredPython(): string | undefined {
  const candidates: (string | undefined)[] = [process.env.DSH_OFFICE_PYTHON]
  const config = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'dsh-office-suite', 'config.json')
  if (existsSync(config)) {
    try {
      const parsed = JSON.parse(readFileSync(config, 'utf8')) as { python?: unknown }
      if (typeof parsed.python === 'string')
        candidates.push(parsed.python)
    }
    catch {
      // Ignore a malformed config; the test falls back to the checked-in venv.
    }
  }
  candidates.push(join(PACKAGE_ROOT, '.venv-check', isWindows ? 'Scripts/python.exe' : 'bin/python'))
  candidates.push('python3', 'python')
  return candidates.find(candidate => candidate != null && (candidate.includes('/') || candidate.includes('\\') ? existsSync(candidate) : true))
}

interface CliStatus {
  readonly ok: boolean
  readonly packages: readonly { package: string, installed: boolean }[]
  readonly renderers: {
    readonly libreoffice: string | null
    readonly microsoft_office: { word: string | null, powerpoint: string | null, excel: string | null }
  }
}

function runCli(python: string, args: string[]): Record<string, any> {
  const stdout = execFileSync(python, [officePaths().cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 8 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

const python = configuredPython()
let status: CliStatus | undefined
if (python != null) {
  try {
    status = runCli(python, ['status']) as unknown as CliStatus
  }
  catch {
    status = undefined
  }
}
const ready = status != null && status.packages.every(item => item.installed)

describe('feature registry', () => {
  it('exposes four stable ids and slash commands', () => {
    expect(OFFICE_FEATURES.map(feature => feature.id)).toEqual(['documents', 'pdf', 'presentations', 'spreadsheets'])
    expect(OFFICE_FEATURES.map(feature => feature.command)).toEqual(['documents', 'pdf', 'presentations', 'spreadsheets'])
    for (const feature of OFFICE_FEATURES) {
      expect(featureById(feature.id)).toBe(feature)
      expect(featureByCommand(feature.command)).toBe(feature)
      expect(feature.skill).toMatch(/^office-/u)
      expect(feature.label.length).toBeGreaterThan(0)
    }
  })

  it('returns undefined for unknown ids and commands', () => {
    expect(featureById('slides')).toBeUndefined()
    expect(featureByCommand('docs')).toBeUndefined()
  })
})

const CLI_KIND: Record<OfficeFeatureId, 'docx' | 'pdf' | 'pptx' | 'xlsx'> = {
  documents: 'docx',
  pdf: 'pdf',
  presentations: 'pptx',
  spreadsheets: 'xlsx',
}

describe.runIf(ready)('office CLI integration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh office 中文 '))
  const image = join(directory, 'icon.png')
  const specs: Record<'docx' | 'pdf' | 'pptx' | 'xlsx', object> = {
    docx: {
      title: '季度报告 Q3',
      author: 'DSH Office Suite',
      blocks: [
        { type: 'heading', level: 1, text: '执行摘要' },
        { type: 'paragraph', text: '本季度收入同比增长 18.4%。' },
        { type: 'bullets', items: ['续约率 92%', '新增客户 42 家'] },
        { type: 'table', headers: ['指标', 'Q3'], rows: [['收入', '¥12,480,000'], ['毛利率', '71.2%']] },
        { type: 'equation', latex: '\\frac{a^2+b^2}{c^2}' },
      ],
    },
    pdf: {
      title: '产品说明',
      blocks: [
        { type: 'heading', level: 1, text: '产品说明' },
        { type: 'paragraph', text: '中文、English、数字 123 与标点。' },
        { type: 'table', headers: ['项目', '值'], rows: [['版本', '1.0']] },
      ],
    },
    pptx: {
      title: '年度汇报',
      slides: [
        { layout: 'title', title: '年度汇报', subtitle: '内部审阅' },
        { layout: 'blank', title: '数据', table: { headers: ['季度', '收入'], rows: [['Q1', 100], ['Q2', 128]] }, chart: { type: 'column', left: 3.6, top: 3.5, width: 8.8, height: 3.0, categories: ['Q1', 'Q2'], series: [{ name: '收入', values: [100, 128] }] } },
      ],
    },
    xlsx: {
      sheets: [{
        name: '汇总',
        rows: [['季度', '收入', '成本', '毛利'], ['Q1', 100, 60, '=B2-C2'], ['Q2', 128, 70, '=B3-C3'], [null, '=SUM(B2:B3)']],
        freeze: 'A2',
        styles: { 'A1:D1': { bold: true, fill: '#E8EEF7' } },
        charts: [{ type: 'column', anchor: 'F2', data: { min_col: 2, min_row: 1, max_col: 2, max_row: 3 } }],
      }],
    },
  }

  writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

  function create(feature: OfficeFeatureId, name: string): string {
    const kind = CLI_KIND[feature]
    const spec = join(directory, `${kind}.json`)
    const out = join(directory, `${name}.${kind}`)
    writeFileSync(spec, JSON.stringify(specs[kind]))
    const result = runCli(python!, [kind, 'create', '--spec', spec, '--out', out])
    expect(result.ok).toBe(true)
    expect(existsSync(out)).toBe(true)
    return out
  }

  function read(kind: string, file: string, dataOnly = false): Record<string, any> {
    return runCli(python!, [kind, 'read', '--input', file, ...(dataOnly ? ['--data-only'] : [])])
  }

  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it('creates and reads DOCX content including CJK, tables, and equations', () => {
    const file = create('documents', '季度 报告')
    const result = read('docx', file)
    expect(result.headings).toContain('执行摘要')
    expect(result.tables[0].rows[1][0]).toBe('收入')
    expect(result.equations).toBe(1)
  })

  it('edits DOCX text and appends a heading without losing the equation', () => {
    const file = create('documents', '季度 报告-编辑前')
    const spec = join(directory, 'docx-edit.json')
    const out = join(directory, '季度 报告-编辑后.docx')
    writeFileSync(spec, JSON.stringify({ replace: [{ find: '42 家', replace: '51 家' }], blocks: [{ type: 'heading', level: 2, text: '附录' }] }))
    expect(runCli(python!, ['docx', 'edit', '--input', file, '--spec', spec, '--out', out]).replacements).toBe(1)
    const result = read('docx', out)
    expect(result.paragraphs.some((item: { text: string }) => item.text.includes('51 家'))).toBe(true)
    expect(result.headings).toContain('附录')
    expect(result.equations).toBe(1)
  })

  it('creates and reads a Chinese PDF', () => {
    const file = create('pdf', '产品 说明')
    const result = read('pdf', file)
    expect(result.page_count).toBeGreaterThan(0)
    expect(result.pages.map((page: { text: string }) => page.text).join('')).toContain('产品说明')
  })

  it('edits PDF metadata and writes a separate file', () => {
    const file = create('pdf', '产品 说明-编辑前')
    const spec = join(directory, 'pdf-edit.json')
    const out = join(directory, '产品 说明-编辑后.pdf')
    writeFileSync(spec, JSON.stringify({ metadata: { Title: '产品说明（已编辑）' } }))
    expect(runCli(python!, ['pdf', 'edit', '--input', file, '--spec', spec, '--out', out]).page_count).toBe(1)
    expect(read('pdf', out).metadata['/Title']).toBe('产品说明（已编辑）')
  })

  it('creates, reads, and edits a PPTX deck', () => {
    const file = create('presentations', '年度 汇报')
    const result = read('pptx', file)
    expect(result.slide_count).toBe(2)
    expect(result.slides[1].charts[0].categories).toEqual(['Q1', 'Q2'])
    const spec = join(directory, 'pptx-edit.json')
    const out = join(directory, '年度 汇报-编辑后.pptx')
    writeFileSync(spec, JSON.stringify({ slides: [{ layout: 'bullets', title: '下一步', bullets: ['验收', '发布'] }] }))
    expect(runCli(python!, ['pptx', 'edit', '--input', file, '--spec', spec, '--out', out]).added.slides).toBe(1)
    expect(read('pptx', out).slide_count).toBe(3)
  })

  it('creates, reads, and edits an XLSX workbook', () => {
    const file = create('spreadsheets', '财务 模型')
    const result = read('xlsx', file)
    expect(result.sheets[0].formulas.length).toBe(3)
    const spec = join(directory, 'xlsx-edit.json')
    const out = join(directory, '财务 模型-编辑后.xlsx')
    writeFileSync(spec, JSON.stringify({ operations: [{ action: 'set_cells', sheet: '汇总', cells: { E2: '已审核' } }] }))
    expect(runCli(python!, ['xlsx', 'edit', '--input', file, '--spec', spec, '--out', out]).changes).toBe(1)
    expect(read('xlsx', out).sheets[0].rows[1][4]).toBe('已审核')
  })

  it.runIf(isWindows && status?.renderers.microsoft_office.excel != null)('recalculates XLSX formulas through Excel', () => {
    const file = create('spreadsheets', '财务 模型-计算前')
    const out = join(directory, '财务 模型-计算后.xlsx')
    expect(runCli(python!, ['xlsx', 'recalc', '--input', file, '--out', out]).ok).toBe(true)
    const rows = (read('xlsx', out, true) as { sheets: { rows: unknown[][] }[] }).sheets[0].rows
    expect(rows[1][3]).toBe(40)
    expect(rows[3][1]).toBe(228)
  })

  it.runIf(status?.renderers.libreoffice != null || status?.renderers.microsoft_office.word != null)('renders DOCX pages to PNG', () => {
    const file = create('documents', '季度 报告-渲染')
    const out = join(directory, 'render')
    const result = runCli(python!, ['docx', 'render', '--input', file, '--out-dir', out])
    expect(result.page_count).toBeGreaterThan(0)
    const pages = readdirSync(out).filter(name => name.endsWith('.png'))
    expect(pages.length).toBe(result.page_count)
    for (const page of pages)
      expect(readFileSync(join(out, page)).byteLength).toBeGreaterThan(10_000)
  })
})
