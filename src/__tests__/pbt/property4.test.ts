// Feature: openclaw-stock-analysis-skill, Property 4: 趨勢計算正確性
// **Validates: Requirements 3.2**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateTrends } from '../../services/analysisEngine.js';
import type { FinancialReport } from '../../models/financial.js';

// --- Arbitraries ---

const dateArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const finDouble = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true });

/** Non-zero double for denominator cases */
const nonZeroDouble = fc.oneof(
  fc.double({ min: 0.01, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -1e9, max: -0.01, noNaN: true, noDefaultInfinity: true }),
);

const incomeStatementArb = fc.record({
  date: dateArb,
  revenue: finDouble,
  grossProfit: finDouble,
  operatingIncome: finDouble,
  netIncome: finDouble,
  eps: finDouble,
});

/** Income statement with all non-zero metric values (for denominator safety) */
const nonZeroIncomeStatementArb = fc.record({
  date: dateArb,
  revenue: nonZeroDouble,
  grossProfit: nonZeroDouble,
  operatingIncome: nonZeroDouble,
  netIncome: nonZeroDouble,
  eps: nonZeroDouble,
});

const balanceSheetArb = fc.record({
  date: dateArb,
  totalAssets: finDouble,
  totalLiabilities: finDouble,
  totalEquity: finDouble,
  totalDebt: finDouble,
  bookValuePerShare: finDouble,
});

const nonZeroBalanceSheetArb = fc.record({
  date: dateArb,
  totalAssets: nonZeroDouble,
  totalLiabilities: nonZeroDouble,
  totalEquity: nonZeroDouble,
  totalDebt: nonZeroDouble,
  bookValuePerShare: nonZeroDouble,
});

const cashFlowStatementArb = fc.record({
  date: dateArb,
  operatingCashFlow: finDouble,
  capitalExpenditure: finDouble,
  freeCashFlow: finDouble,
});

const nonZeroCashFlowStatementArb = fc.record({
  date: dateArb,
  operatingCashFlow: nonZeroDouble,
  capitalExpenditure: nonZeroDouble,
  freeCashFlow: nonZeroDouble,
});

// --- Helpers ---

const EPSILON = 1e-6;

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / denom < EPSILON;
}


// --- Tests ---

describe('Property 4: 趨勢計算正確性', () => {
  it('QoQ = (current - previous) / |previous| for income metrics with non-zero previous', () => {
    fc.assert(
      fc.property(
        incomeStatementArb,                // index 0 (current)
        nonZeroIncomeStatementArb,         // index 1 (previous, non-zero for denominator)
        incomeStatementArb,                // index 2
        incomeStatementArb,                // index 3
        (q0, q1, q2, q3) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [q0, q1, q2, q3],
            balanceSheets: [],
            cashFlowStatements: [],
          };

          const trends = calculateTrends(report);
          const incomeMetrics = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps'] as const;

          for (const field of incomeMetrics) {
            const current = q0[field];
            const previous = q1[field];
            const expected = (current - previous) / Math.abs(previous);
            expect(trends[field]).toBeDefined();
            expect(trends[field].qoq).not.toBeNull();
            expect(approxEqual(trends[field].qoq!, expected)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('YoY = (current - yearAgo) / |yearAgo| for income metrics with non-zero yearAgo', () => {
    fc.assert(
      fc.property(
        incomeStatementArb,                // index 0 (current)
        incomeStatementArb,                // index 1
        incomeStatementArb,                // index 2
        nonZeroIncomeStatementArb,         // index 3 (yearAgo, non-zero for denominator)
        (q0, q1, q2, q3) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [q0, q1, q2, q3],
            balanceSheets: [],
            cashFlowStatements: [],
          };

          const trends = calculateTrends(report);
          const incomeMetrics = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps'] as const;

          for (const field of incomeMetrics) {
            const current = q0[field];
            const yearAgo = q3[field];
            const expected = (current - yearAgo) / Math.abs(yearAgo);
            expect(trends[field]).toBeDefined();
            expect(trends[field].yoy).not.toBeNull();
            expect(approxEqual(trends[field].yoy!, expected)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('QoQ and YoY for balance sheet metrics with non-zero denominators', () => {
    fc.assert(
      fc.property(
        balanceSheetArb,
        nonZeroBalanceSheetArb,
        balanceSheetArb,
        nonZeroBalanceSheetArb,
        (q0, q1, q2, q3) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [],
            balanceSheets: [q0, q1, q2, q3],
            cashFlowStatements: [],
          };

          const trends = calculateTrends(report);
          // Balance metrics tracked by calculateTrends: totalAssets, totalEquity, totalDebt
          const balanceMetrics = ['totalAssets', 'totalEquity', 'totalDebt'] as const;

          for (const field of balanceMetrics) {
            const current = q0[field];
            const previous = q1[field];
            const yearAgo = q3[field];

            const expectedQoQ = (current - previous) / Math.abs(previous);
            const expectedYoY = (current - yearAgo) / Math.abs(yearAgo);

            expect(trends[field]).toBeDefined();
            expect(trends[field].qoq).not.toBeNull();
            expect(approxEqual(trends[field].qoq!, expectedQoQ)).toBe(true);
            expect(trends[field].yoy).not.toBeNull();
            expect(approxEqual(trends[field].yoy!, expectedYoY)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('QoQ and YoY for cash flow metrics with non-zero denominators', () => {
    fc.assert(
      fc.property(
        cashFlowStatementArb,
        nonZeroCashFlowStatementArb,
        cashFlowStatementArb,
        nonZeroCashFlowStatementArb,
        (q0, q1, q2, q3) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [],
            balanceSheets: [],
            cashFlowStatements: [q0, q1, q2, q3],
          };

          const trends = calculateTrends(report);
          // Cash flow metrics tracked: operatingCashFlow, freeCashFlow
          const cfMetrics = ['operatingCashFlow', 'freeCashFlow'] as const;

          for (const field of cfMetrics) {
            const current = q0[field];
            const previous = q1[field];
            const yearAgo = q3[field];

            const expectedQoQ = (current - previous) / Math.abs(previous);
            const expectedYoY = (current - yearAgo) / Math.abs(yearAgo);

            expect(trends[field]).toBeDefined();
            expect(trends[field].qoq).not.toBeNull();
            expect(approxEqual(trends[field].qoq!, expectedQoQ)).toBe(true);
            expect(trends[field].yoy).not.toBeNull();
            expect(approxEqual(trends[field].yoy!, expectedYoY)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('QoQ is null when previous quarter value is zero', () => {
    fc.assert(
      fc.property(
        finDouble,
        (currentRevenue) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [
              { date: '2024-03-31', revenue: currentRevenue, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-12-31', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-09-30', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-06-30', revenue: 100, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
            ],
            balanceSheets: [],
            cashFlowStatements: [],
          };

          const trends = calculateTrends(report);
          // revenue QoQ should be null because previous (index 1) revenue is 0
          expect(trends['revenue']).toBeDefined();
          expect(trends['revenue'].qoq).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('YoY is null when year-ago quarter value is zero', () => {
    fc.assert(
      fc.property(
        finDouble,
        (currentRevenue) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [
              { date: '2024-03-31', revenue: currentRevenue, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-12-31', revenue: 100, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-09-30', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
              { date: '2023-06-30', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
            ],
            balanceSheets: [],
            cashFlowStatements: [],
          };

          const trends = calculateTrends(report);
          // revenue YoY should be null because yearAgo (index 3) revenue is 0
          expect(trends['revenue']).toBeDefined();
          expect(trends['revenue'].yoy).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
