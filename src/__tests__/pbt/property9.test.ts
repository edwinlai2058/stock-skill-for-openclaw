// Feature: openclaw-stock-analysis-skill, Property 9: 批次報告正確性
// **Validates: Requirements 5.2, 5.3**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateBatchSummary } from '../../services/analysisEngine.js';
import type { AnalysisReport, FailedTicker, ScoringItem } from '../../models/analysis.js';

// --- Constants ---

const VALID_RECOMMENDATIONS = ['強力推薦', '推薦', '中性', '不推薦', '強力不推薦'] as const;

// --- Arbitraries ---

const scoringBreakdownArb: fc.Arbitrary<ScoringItem[]> = fc.constant([
  { category: '獲利能力', weight: 0.25, score: 50, reason: 'test' },
  { category: '估值合理性', weight: 0.25, score: 50, reason: 'test' },
  { category: '財務健全度', weight: 0.20, score: 50, reason: 'test' },
  { category: '現金流品質', weight: 0.15, score: 50, reason: 'test' },
  { category: '成長趨勢', weight: 0.15, score: 50, reason: 'test' },
]);

const analysisReportArb: fc.Arbitrary<AnalysisReport> = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,5}$/),
    fc.integer({ min: 0, max: 100 }),
    fc.constantFrom(...VALID_RECOMMENDATIONS),
    scoringBreakdownArb,
  )
  .map(([ticker, score, recommendation, scoringBreakdown]) => ({
    ticker,
    score,
    recommendation,
    scoringBreakdown,
    strengths: [],
    risks: [],
    dataConfidence: 'high' as const,
    disclaimer: '本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。',
  }));

const failedTickerArb: fc.Arbitrary<FailedTicker> = fc.record({
  ticker: fc.stringMatching(/^[A-Z]{1,5}$/),
  reason: fc.stringMatching(/^[a-zA-Z ]{5,30}$/),
});

// --- Tests ---

describe('Property 9: 批次報告正確性', () => {
  it('totalCompleted equals reports.length and totalFailed equals failedTickers.length', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 0, maxLength: 15 }),
        fc.array(failedTickerArb, { minLength: 0, maxLength: 10 }),
        (reports, failedTickers) => {
          const batch = generateBatchSummary(reports, failedTickers);

          expect(batch.totalCompleted).toBe(reports.length);
          expect(batch.totalFailed).toBe(failedTickers.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('totalCompleted + totalFailed equals totalRequested', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 0, maxLength: 15 }),
        fc.array(failedTickerArb, { minLength: 0, maxLength: 10 }),
        (reports, failedTickers) => {
          const batch = generateBatchSummary(reports, failedTickers);

          expect(batch.totalCompleted + batch.totalFailed).toBe(batch.totalRequested);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rankings only contains successful reports and is sorted by score descending', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 0, maxLength: 15 }),
        fc.array(failedTickerArb, { minLength: 0, maxLength: 10 }),
        (reports, failedTickers) => {
          const batch = generateBatchSummary(reports, failedTickers);

          // Rankings should have the same count as successful reports
          expect(batch.rankings).toHaveLength(reports.length);

          // Rankings should be sorted by score descending
          for (let i = 0; i < batch.rankings.length - 1; i++) {
            expect(batch.rankings[i].score).toBeGreaterThanOrEqual(batch.rankings[i + 1].score);
          }

          // All ranked tickers should come from the input reports
          const reportTickers = new Set(reports.map((r) => r.ticker));
          for (const ranked of batch.rankings) {
            expect(reportTickers.has(ranked.ticker)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('failedTickers contains all failed tickers from input', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 0, maxLength: 15 }),
        fc.array(failedTickerArb, { minLength: 0, maxLength: 10 }),
        (reports, failedTickers) => {
          const batch = generateBatchSummary(reports, failedTickers);

          // failedTickers in batch should match input failedTickers exactly
          expect(batch.failedTickers).toHaveLength(failedTickers.length);

          for (let i = 0; i < failedTickers.length; i++) {
            expect(batch.failedTickers[i].ticker).toBe(failedTickers[i].ticker);
            expect(batch.failedTickers[i].reason).toBe(failedTickers[i].reason);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
