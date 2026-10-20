import type { RuntimeStatus } from '../src/python'
import { describe, expect, it } from 'vitest'
import { runtimeAlive } from '../src/python'

function status(python: RuntimeStatus['python']): RuntimeStatus {
  return {
    state: 'ok',
    python,
    packages: [],
    missing: [],
    remedy: 'node postinstall.mjs',
  }
}

function inspection(path: string): NonNullable<RuntimeStatus['python']> {
  return {
    path,
    version: '3.13.0',
    major: 3,
    minor: 13,
    compatible: true,
    packages: [],
    missing: [],
  }
}

describe('runtimeAlive', () => {
  it('keeps a cached runtime while its interpreter exists', () => {
    expect(runtimeAlive(status(inspection(process.execPath)))).toBe(true)
  })

  it('rejects a cached runtime whose interpreter vanished', () => {
    expect(runtimeAlive(status(inspection('C:/no/such/venv/Scripts/python.exe')))).toBe(false)
  })

  it('does not treat a failed state as a stale interpreter', () => {
    expect(runtimeAlive({ state: 'no-interpreter', packages: [], missing: [], remedy: 'x' })).toBe(true)
  })
})
