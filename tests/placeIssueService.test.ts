import { describe, expect, it } from 'vitest'
import type { PlaceIssue } from '~/app/data/pond'
import {
  submitPlaceIssue,
  submitPlaceIssueAction,
  type PlaceIssueWorkflowState,
} from '~/app/services/placeIssueService'

const issue = (overrides: Partial<PlaceIssue> = {}): PlaceIssue => ({
  id: 'issue-existing',
  lake: 'velky-cetin',
  targetType: 'peg',
  targetId: 'vc-03',
  targetLabel: 'Chata 3',
  category: 'lighting',
  title: 'Nesvieti svetlo',
  description: 'Vonkajšie svetlo pri chate nesvieti.',
  priority: 'normal',
  status: 'new',
  internalNote: '',
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z',
  ...overrides,
})

const state = (issues: PlaceIssue[] = []): PlaceIssueWorkflowState => ({
  placeIssues: issues,
})

describe('placeIssueService', () => {
  it('creates a public issue for a selected peg', () => {
    const result = submitPlaceIssue(
      {
        category: 'lighting',
        description: 'Na schodoch pri chate nesvieti vonkajšie svetlo.',
        lake: 'velky-cetin',
        reporterName: 'Marek',
        reporterPhone: '+421 900 111 222',
        targetId: 'vc-03',
        targetType: 'peg',
        title: 'Nesvieti svetlo',
      },
      state(),
      undefined,
      '2026-06-16T12:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.issue).toMatchObject({
      category: 'lighting',
      lake: 'velky-cetin',
      priority: 'normal',
      status: 'new',
      targetId: 'vc-03',
      targetLabel: 'Chata 3',
      targetType: 'peg',
    })
    expect(result.placeIssues[0]?.id).toContain('issue-20260616-chata-3')
  })

  it('rejects an issue for a missing target', () => {
    const result = submitPlaceIssue({
      category: 'broken',
      description: 'Niečo je pokazené.',
      lake: 'velky-cetin',
      targetId: 'missing-peg',
      targetType: 'peg',
      title: 'Pokazené miesto',
    }, state())

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.statusCode).toBe(404)
    expect(result.messages).toContain('Vybrané lovné miesto neexistuje pre zvolené jazero.')
  })

  it('updates status, priority and assignee from admin action', () => {
    const result = submitPlaceIssueAction({
      assignedTo: 'Brigádnik',
      internalNote: 'Vymeniť žiarovku pri najbližšej obchôdzke.',
      issueId: 'issue-existing',
      priority: 'urgent',
      resolutionNote: '',
      status: 'in-progress',
    }, state([issue()]), '2026-06-16T13:00:00.000Z')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.issue).toMatchObject({
      assignedTo: 'Brigádnik',
      priority: 'urgent',
      status: 'in-progress',
      updatedAt: '2026-06-16T13:00:00.000Z',
    })
  })
})
