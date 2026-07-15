'use strict'

const budgets = require('./lighthouse-budget.json')

const externalBaseUrl = process.env.LHCI_BASE_URL?.replace(/\/$/, '')
const baseUrl = externalBaseUrl || 'http://127.0.0.1:4173'
const numberOfRuns = Number(process.env.LHCI_RUNS || 3)

if (!Number.isInteger(numberOfRuns) || numberOfRuns < 1) {
  throw new Error('LHCI_RUNS must be a positive integer.')
}

const commonAssertions = {
  'categories:accessibility': ['error', { minScore: 0.98 }],
  'categories:best-practices': ['error', { minScore: 0.95 }],
  'categories:performance': ['error', { minScore: 0.8 }],
  'categories:seo': ['error', { minScore: 0.95 }],
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pathPattern = path => `^https?://[^/]+${escapeRegExp(path)}(?:[?#].*)?$`

const budgetAssertions = budget => {
  const assertions = { ...commonAssertions }

  for (const timing of budget.timings || []) {
    assertions[timing.metric] = ['error', { maxNumericValue: timing.budget }]
  }

  for (const resource of budget.resourceSizes || []) {
    assertions[`resource-summary:${resource.resourceType}:size`] = [
      'error',
      { maxNumericValue: resource.budget * 1024 },
    ]
  }

  for (const resource of budget.resourceCounts || []) {
    assertions[`resource-summary:${resource.resourceType}:count`] = [
      'error',
      { maxNumericValue: resource.budget },
    ]
  }

  return assertions
}

module.exports = {
  ci: {
    assert: {
      assertMatrix: budgets.map(budget => ({
        aggregationMethod: 'median-run',
        assertions: budgetAssertions(budget),
        matchingUrlPattern: pathPattern(budget.path),
      })),
      includePassedAssertions: true,
    },
    collect: {
      numberOfRuns,
      puppeteerLaunchOptions: {
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      },
      settings: {
        formFactor: 'mobile',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        screenEmulation: {
          disabled: false,
          deviceScaleFactor: 2.625,
          height: 844,
          mobile: true,
          width: 390,
        },
        throttlingMethod: 'simulate',
      },
      startServerCommand: externalBaseUrl
        ? undefined
        : 'pnpm build && HOST=127.0.0.1 PORT=4173 node .output/server/index.mjs',
      startServerReadyPattern: 'Listening on http://127.0.0.1:4173',
      startServerReadyTimeout: 240_000,
      url: budgets.map(budget => `${baseUrl}${budget.path}`),
    },
    upload: {
      outputDir: 'test-results/lighthouse-ci',
      target: 'filesystem',
    },
  },
}
