import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  CONFIG_DIR,
  installerArguments,
  LEGACY_VENV_DIR,
  RUNTIME_DIR,
  VENV_DIR,
} from '../postinstall.mjs'
import { officePaths } from '../src/python'

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

describe('config location', () => {
  it('writes config where the host half reads it', () => {
    // A platform mismatch here leaves a ready venv undiscoverable: the host half
    // reports missing-dependencies and every skill refuses to run.
    expect(join(CONFIG_DIR, 'config.json')).toBe(officePaths().configFile)
  })

  it('uses the XDG config directory on Linux', () => {
    if (process.platform !== 'linux')
      return
    expect(CONFIG_DIR.startsWith(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))).toBe(true)
    expect(CONFIG_DIR).not.toContain('AppData')
  })

  it('records a legacy config location the host half can still read', () => {
    expect(officePaths().legacyConfigFile).toContain('dsh-office-kit')
  })
})
