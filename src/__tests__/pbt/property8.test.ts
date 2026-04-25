// Feature: openclaw-stock-analysis-skill, Property 8: 資料不足時標註低可信度
// **Validates: Requirements 4.5**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateInvestment } from '../../services/analysisEngine.js';
import type { FundamentalAnalysis, FundamentalIndicator, TrendData } from '../../models/analysis.js';

// --- Constants ---

const INDICATOR_NAMES = ['EPS', 'P/E', 'P/B', 'ROE', 'D/E', 'FCF'] as const;

// --- Arbitraries ---

const finDouble = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

/** Indicator with a non-null value (for full data) */
const fullIndicatorArb = (name: string): fc.Arbitrary<FundamentalIndicator> =>
  finDouble.map((value) => ({
    name,
    value,
    description: `Description for ${name}`,
  }));

/** Indicator with null value and missingFields (for partial data) */
const nullIndicatorArb = (name: string): fc.Arbitrary<FundamentalIndicator> =>
  fc.constant({
    name,
    value: null,
    description: `Description for ${name}`,
    missingFields: [`${name}_field`],
  });

/** Indicator that is randomly null or non-null, but at least one must be null for partial */
const mixedIndicatorArb = (name: string): fc.Arbitrary<FundamentalIndicator> =>
  fc.oneof(fullIndicatorArb(name), nullIndicatorArb(name));

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

const trendsArb: fc.Arbitrary<Record<string, TrendData>> = fc
  .subarray(['revenue', 'grossProfit', 'operatingIncome'] as const, { minLength: 0, maxLength: 3 })
  .chain((keys) =>
    fc.tuple(...keys.map(() => trendDataArb)).map((trends) => {
      const result: Record<string, TrendData> = {};
      keys.forEach((key, i) => {
        result[key] = trends[i];
      });
      return result;
    }),
  );

/**
 * Generates a FundamentalAnalysis with dataCompleteness='partial'.
 * At least one indicator must have value=null.
 */
const partialAnalysisArb: fc.Arbitrary<FundamentalAnalysis> = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,5}$/),
    // Generate mixed indicators, then ensure at least one is null
    ...INDICATOR_NAMES.map((name) => mixedIndicatorArb(name)),
    trendsArb,
  )
  .chain(([ticker, eps, pe, pb, roe, de, fcf, trends]) => {
    const indicators = [eps, pe, pb, roe, de, fcf] as FundamentalIndicator[];
    const hasNull = indicators.some((i) => i.value === null);

    if (hasNull) {
      // Already has at least one null — use as-is
      return fc.constant({
        ticker: ticker as string,
        indicators,
        trends: trends as Record<string, TrendData>,
        dataCompleteness: 'partial' as const,
      });
    }

    // Force one random indicator to be null
    return fc.integer({ min: 0, max: 5 }).map((idx) => {
      indicators[idx] = {
        name: indicators[idx].name,
        value: null,
        description: indicators[idx].description,
        missingFields: [`${indicators[idx].name}_field`],
      };
      return {
        ticker: ticker as string,
        indicators,
        trends: trends as Record<string, TrendData>,
        dataCompleteness: 'partial' as const,
      };
    });
  });

/**
 * Generates a FundamentalAnalysis with dataCompleteness='full'.
 * All indicators have non-null values.
 */
const fullAnalysisArb: fc.Arbitrary<FundamentalAnalysis> = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,5}$/),
    ...INDICATOR_NAMES.map((name) => fullIndicatorArb(name)),
    trendsArb,
  )
  .map(([ticker, eps, pe, pb, roe, de, fcf, trends]) => ({
    ticker: ticker as string,
    indicators: [eps, pe, pb, roe, de, fcf] as FundamentalIndicator[],
    trends: trends as Record<string, TrendData>,
    dataCompleteness: 'full' as const,
  }));

// --- Tests ---

describe('Property 8: 資料不足時標註低可信度', () => {
  it('dataCompleteness=partial → dataConfidence=low and missingData is non-empty', () => {
    fc.assert(
      fc.property(partialAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);

        expect(report.dataConfidence).toBe('low');
        expect(report.missingData).toBeDefined();
        expect(report.missingData!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('dataCompleteness=full → dataConfidence=high', () => {
    fc.assert(
      fc.property(fullAnalysisArb, (analysis) => {
        const report = evaluateInvestment(analysis);

        expect(report.dataConfidence).toBe('high');
      }),
      { numRuns: 100 },
    );
  });
});
