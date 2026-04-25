// Feature: openclaw-stock-analysis-skill, Property 6: 投資評估報告完整性
// **Validates: Requirements 4.1, 4.2, 4.4**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateInvestment } from '../../services/analysisEngine.js';
import type { FundamentalAnalysis, FundamentalIndicator, TrendData } from '../../models/analysis.js';

// --- Constants ---

const VALID_RECOMMENDATIONS = ['強力推薦', '推薦', '中性', '不推薦', '強力不推薦'] as const;
const EXPECTED_DISCLAIMER_TEXT = '本分析報告僅供參考，不構成任何投資建議';
const INDICATOR_NAMES = ['EPS', 'P/E', 'P/B', 'ROE', 'D/E', 'FCF'] as const;

// --- Arbitraries ---

const finDouble = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

const nullableFinDouble = fc.oneof(
  finDouble,
  fc.constant(null),
);

const fundamentalIndicatorArb = (name: string): fc.Arbitrary<FundamentalIndicator> =>
  nullableFinDouble.chain((value) =>
    fc.record({
      name: fc.constant(name),
      value: fc.constant(value),
      description: fc.constant(`Description for ${name}`),
      ...(value === null
        ? { missingFields: fc.constant([`${name}_field`]) }
        : {}),
    }),
  );

const trendDataArb: fc.Arbitrary<TrendData> = fc.record({
  qoq: fc.oneof(
    fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
  yoy: fc.oneof(
    fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
});

const trendKeys = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps'] as const;

const trendsArb: fc.Arbitrary<Record<string, TrendData>> = fc
  .tuple(
    fc.subarray([...trendKeys], { minLength: 0, maxLength: trendKeys.length }),
    fc.array(trendDataArb, { minLength: trendKeys.length, maxLength: trendKeys.length }),
  )
  .map(([keys, trends]) => {
    const result: Record<string, TrendData> = {};
    keys.forEach((key, i) => {
      result[key] = trends[i];
    });
    return result;
  });

const fundamentalAnalysisArb: fc.Arbitrary<FundamentalAnalysis> = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,5}$/),
    ...INDICATOR_NAMES.map((name) => fundamentalIndicatorArb(name)),
    trendsArb,
    fc.constantFrom('full' as const, 'partial' as const),
  )
  .map(([ticker, eps, pe, pb, roe, de, fcf, trends, dataCompleteness]) => ({
    ticker,
    indicators: [eps, pe, pb, roe, de, fcf] as FundamentalIndicator[],
    trends,
    dataCompleteness,
  }));

// --- Tests ---

describe('Property 6: 投資評估報告完整性', () => {
  it('(a) score is between 0 and 100', () => {
    fc.assert(
      fc.property(fundamentalAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it('(b) recommendation is one of the 5 valid values', () => {
    fc.assert(
      fc.property(fundamentalAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);
        expect(VALID_RECOMMENDATIONS).toContain(report.recommendation);
      }),
      { numRuns: 100 },
    );
  });

  it('(c) scoringBreakdown weights sum to 1.0', () => {
    fc.assert(
      fc.property(fundamentalAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);
        const weightSum = report.scoringBreakdown.reduce((sum, item) => sum + item.weight, 0);
        expect(weightSum).toBeCloseTo(1.0, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('(d) each ScoringItem has category, weight, score, reason', () => {
    fc.assert(
      fc.property(fundamentalAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);
        expect(report.scoringBreakdown.length).toBeGreaterThan(0);

        for (const item of report.scoringBreakdown) {
          expect(typeof item.category).toBe('string');
          expect(item.category.length).toBeGreaterThan(0);

          expect(typeof item.weight).toBe('number');
          expect(item.weight).toBeGreaterThanOrEqual(0);
          expect(item.weight).toBeLessThanOrEqual(1);

          expect(typeof item.score).toBe('number');
          expect(item.score).toBeGreaterThanOrEqual(0);
          expect(item.score).toBeLessThanOrEqual(100);

          expect(typeof item.reason).toBe('string');
          expect(item.reason.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(e) disclaimer is non-empty and contains the expected text', () => {
    fc.assert(
      fc.property(fundamentalAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);
        expect(report.disclaimer).toBeDefined();
        expect(report.disclaimer.length).toBeGreaterThan(0);
        expect(report.disclaimer).toContain(EXPECTED_DISCLAIMER_TEXT);
      }),
      { numRuns: 100 },
    );
  });
});
