// Feature: openclaw-stock-analysis-skill, Property 3: 基本面指標計算正確性
// **Validates: Requirements 3.1**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateFundamentals } from '../../services/analysisEngine.js';
import type { FinancialReport } from '../../models/financial.js';
import type { StockQuote } from '../../models/price.js';

// --- Arbitraries ---

/** Date string in YYYY-MM-DD format */
const dateArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const finDouble = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true });

/** Non-zero double for denominators */
const nonZeroDouble = fc.oneof(
  fc.double({ min: 0.01, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -1e9, max: -0.01, noNaN: true, noDefaultInfinity: true }),
);

/** IncomeStatement with non-zero EPS */
const incomeStatementArb = fc.record({
  date: dateArb,
  revenue: finDouble,
  grossProfit: finDouble,
  operatingIncome: finDouble,
  netIncome: finDouble,
  eps: nonZeroDouble,
});

/** BalanceSheet with non-zero totalEquity and bookValuePerShare */
const balanceSheetArb = fc.record({
  date: dateArb,
  totalAssets: finDouble,
  totalLiabilities: finDouble,
  totalEquity: nonZeroDouble,
  totalDebt: finDouble,
  bookValuePerShare: nonZeroDouble,
});

/** CashFlowStatement */
const cashFlowStatementArb = fc.record({
  date: dateArb,
  operatingCashFlow: finDouble,
  capitalExpenditure: finDouble,
  freeCashFlow: finDouble,
});

/** FinancialReport with at least one entry in each statement array */
const financialReportArb = fc.record({
  ticker: fc.stringMatching(/^[A-Z]{1,5}$/),
  incomeStatements: fc.array(incomeStatementArb, { minLength: 1, maxLength: 4 }),
  balanceSheets: fc.array(balanceSheetArb, { minLength: 1, maxLength: 4 }),
  cashFlowStatements: fc.array(cashFlowStatementArb, { minLength: 1, maxLength: 4 }),
});

/** StockQuote */
const stockQuoteArb = fc.record({
  ticker: fc.stringMatching(/^[A-Z]{1,5}$/),
  price: fc.double({ min: 0.01, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  change: finDouble,
  changePercent: fc.double({ min: -100, max: 1000, noNaN: true, noDefaultInfinity: true }),
  volume: fc.integer({ min: 0, max: 2_000_000_000 }),
  timestamp: dateArb.map((d) => `${d}T00:00:00.000Z`),
});

// --- Helpers ---

function findIndicator(name: string, indicators: { name: string; value: number | null }[]) {
  return indicators.find((i) => i.name === name);
}

const EPSILON = 1e-6;

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / denom < EPSILON;
}

// --- Tests ---

describe('Property 3: 基本面指標計算正確性', () => {
  it('EPS equals income.eps from the latest income statement', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const epsIndicator = findIndicator('EPS', result.indicators);

        expect(epsIndicator).toBeDefined();
        expect(epsIndicator!.value).toBe(report.incomeStatements[0].eps);
      }),
      { numRuns: 100 },
    );
  });

  it('P/E = price / eps (when eps != 0)', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const peIndicator = findIndicator('P/E', result.indicators);
        const eps = report.incomeStatements[0].eps;

        expect(peIndicator).toBeDefined();
        // eps is guaranteed non-zero by our generator
        const expected = quote.price / eps;
        expect(approxEqual(peIndicator!.value!, expected)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('P/B = price / bookValuePerShare (when bookValuePerShare != 0)', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const pbIndicator = findIndicator('P/B', result.indicators);
        const bvps = report.balanceSheets[0].bookValuePerShare;

        expect(pbIndicator).toBeDefined();
        // bookValuePerShare is guaranteed non-zero by our generator
        const expected = quote.price / bvps;
        expect(approxEqual(pbIndicator!.value!, expected)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('ROE = netIncome / totalEquity (when totalEquity != 0)', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const roeIndicator = findIndicator('ROE', result.indicators);
        const netIncome = report.incomeStatements[0].netIncome;
        const totalEquity = report.balanceSheets[0].totalEquity;

        expect(roeIndicator).toBeDefined();
        // totalEquity is guaranteed non-zero by our generator
        const expected = netIncome / totalEquity;
        expect(approxEqual(roeIndicator!.value!, expected)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('D/E = totalDebt / totalEquity (when totalEquity != 0)', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const deIndicator = findIndicator('D/E', result.indicators);
        const totalDebt = report.balanceSheets[0].totalDebt;
        const totalEquity = report.balanceSheets[0].totalEquity;

        expect(deIndicator).toBeDefined();
        // totalEquity is guaranteed non-zero by our generator
        const expected = totalDebt / totalEquity;
        expect(approxEqual(deIndicator!.value!, expected)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('FCF = operatingCashFlow - capitalExpenditure', () => {
    fc.assert(
      fc.property(financialReportArb, stockQuoteArb, (report, quote) => {
        const result = calculateFundamentals(report, quote);
        const fcfIndicator = findIndicator('FCF', result.indicators);
        const ocf = report.cashFlowStatements[0].operatingCashFlow;
        const capex = report.cashFlowStatements[0].capitalExpenditure;

        expect(fcfIndicator).toBeDefined();
        const expected = ocf - capex;
        expect(approxEqual(fcfIndicator!.value!, expected)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
