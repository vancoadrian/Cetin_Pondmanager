import { describe, expect, it } from 'vitest'
import {
  createErrorPressureCheck,
  createObservedErrorEntry,
  getRecentErrorStats,
  normalizeObservedErrorInput,
  resolveSystemHealthStatus,
  type SystemHealthCheck,
} from '~/app/services/observabilityService'

describe('observabilityService', () => {
  it('normalizes noisy client error payloads', () => {
    const normalized = normalizeObservedErrorInput({
      context: {
        count: 2,
        nested: { route: '/admin' },
        ok: true,
      },
      message: '  Niečo spadlo  ',
      route: '/admin/system',
      severity: 'critical',
      source: 'client',
      stack: 'stack trace',
      userAgent: 'Codex Browser',
    })

    expect(normalized).toMatchObject({
      context: {
        count: 2,
        nested: '{"route":"/admin"}',
        ok: true,
      },
      message: 'Niečo spadlo',
      route: '/admin/system',
      severity: 'critical',
      source: 'client',
      userAgent: 'Codex Browser',
    })
  })

  it('creates unique observed error entries', () => {
    const first = createObservedErrorEntry(
      {
        message: 'Client render failed',
        route: '/admin/system',
      },
      [],
      '2026-06-04T08:00:00.000Z',
    )
    const second = createObservedErrorEntry(
      {
        message: 'Client render failed',
        route: '/admin/system',
      },
      [first],
      '2026-06-04T08:00:00.000Z',
    )

    expect(first.id).toBe('err-20260604080000-client-error')
    expect(second.id).toBe('err-20260604080000-client-error-2')
  })

  it('rolls health status up to the worst check', () => {
    const checks: SystemHealthCheck[] = [
      {
        checkedAt: '2026-06-04T08:00:00.000Z',
        detail: 'ok',
        id: 'runtime',
        label: 'Runtime',
        status: 'ok',
      },
      {
        checkedAt: '2026-06-04T08:00:00.000Z',
        detail: 'degraded',
        id: 'notifications',
        label: 'Notifikácie',
        status: 'degraded',
      },
    ]

    expect(resolveSystemHealthStatus(checks)).toBe('degraded')
    expect(resolveSystemHealthStatus([...checks, { ...checks[0]!, id: 'data', status: 'down' }])).toBe('down')
  })

  it('summarizes recent errors and creates pressure checks', () => {
    const errors = [
      createObservedErrorEntry(
        {
          message: 'Critical',
          severity: 'critical',
          source: 'server',
        },
        [],
        '2026-06-04T08:00:00.000Z',
      ),
      createObservedErrorEntry(
        {
          message: 'Old',
          severity: 'error',
          source: 'client',
        },
        [],
        '2026-05-01T08:00:00.000Z',
      ),
    ]

    expect(getRecentErrorStats(errors, '2026-06-04T09:00:00.000Z')).toMatchObject({
      critical24h: 1,
      total24h: 1,
      warning24h: 0,
    })
    expect(createErrorPressureCheck(errors, '2026-06-04T09:00:00.000Z')).toMatchObject({
      id: 'error-pressure',
      status: 'degraded',
    })
  })
})
