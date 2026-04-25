// Feature: openclaw-stock-analysis-skill, Property 7: 多檔股票排序正確性
// **Validates: Requirements 4.3**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateBatchSummary } from '../../services/analysisEngine.js';
import type { AnalysisReport, ScoringItem } from '../../models/analysis.js';

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

// --- Tests ---

describe('Property 7: 多檔股票排序正確性', () => {
  it('rankings are sorted by score in descending order', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 0, maxLength: 20 }),
        (reports) => {
          const batchReport = generateBatchSummary(reports, []);
          const { rankings } = batchReport;

          // Rankings should have the same length as input reports
          expect(rankings).toHaveLength(reports.length);

          // Verify descending order: each score >= next score
          for (let i = 0; i < rankings.length - 1; i++) {
            expect(rankings[i].score).toBeGreaterThanOrEqual(rankings[i + 1].score);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rankings contain all original reports (no data lost)', () => {
    fc.assert(
      fc.property(
        fc.array(analysisReportArb, { minLength: 1, maxLength: 20 }),
        (reports) => {
          const batchReport = generateBatchSummary(reports, []);
          const { rankings } = batchReport;

          // All original tickers should appear in rankings
          const originalTickers = reports.map((r) => r.ticker).sort();
          const rankedTickers = rankings.map((r) => r.ticker).sort();
          expect(rankedTickers).toEqual(originalTickers);

          // All original scores should appear in rankings
          const originalScores = reports.map((r) => r.score).sort((a, b) => a - b);
          const rankedScores = rankings.map((r) => r.score).sort((a, b) => a - b);
          expect(rankedScores).toEqual(originalScores);
        },
      ),
      { numRuns: 100 },
    );
  });
});
