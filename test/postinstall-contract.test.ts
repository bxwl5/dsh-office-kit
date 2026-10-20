import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  installerArguments,
  LEGACY_VENV_DIR,
  RUNTIME_DIR,
  VENV_DIR,
} from '../postinstall.mjs'

describe('installer arguments', () => {
  const args = installerArguments()

  it('appends PATH through the installer instead of prepending it', () => {
    expect(args).toContain('AppendPath=1')
    expect(args).not.toContain('PrependPath=0')
  })

  it('never sets TargetDir, so the installer keeps its per-user default', () => {
    expect(args.some(arg => arg.startsWith('TargetDir='))).toBe(false)
  })

  it('keeps the py launcher available', () => {
    expect(args).not.toContain('Include_launcher=0')
  })
})

describe('runtime layout', () => {
  it('places the venv under ~/.dsh/office/runtime', () => {
    expect(RUNTIME_DIR.startsWith(homedir())).toBe(true)
    expect(RUNTIME_DIR.split(/[\\/]/u).slice(-3).join('/')).toBe('.dsh/office/runtime')
    expect(VENV_DIR.split(/[\\/]/u).slice(-4).join('/')).toBe('.dsh/office/runtime/venv')
  })

  it('keeps the legacy venv as a read-only fallback path', () => {
    expect(LEGACY_VENV_DIR).not.toBe(VENV_DIR)
    expect(LEGACY_VENV_DIR).toContain('dsh-office-kit')
  })
})
