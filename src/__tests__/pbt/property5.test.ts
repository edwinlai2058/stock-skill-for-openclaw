// Feature: openclaw-stock-analysis-skill, Property 5: 缺失欄位正確標註
// **Validates: Requirements 3.4**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateFundamentals } from '../../services/analysisEngine.js';
import type { FinancialReport, IncomeStatement, BalanceSheet, CashFlowStatement } from '../../models/financial.js';
import type { StockQuote } from '../../models/price.js';

// --- Arbitraries ---

const dateArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const finDouble = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true });

const nonZeroDouble = fc.oneof(
  fc.double({ min: 0.01, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -1e9, max: -0.01, noNaN: true, noDefaultInfinity: true }),
);

const incomeStatementArb: fc.Arbitrary<IncomeStatement> = fc.record({
  date: dateArb,
  revenue: finDouble,
  grossProfit: finDouble,
  operatingIncome: finDouble,
  netIncome: finDouble,
  eps: nonZeroDouble,
});

const balanceSheetArb: fc.Arbitrary<BalanceSheet> = fc.record({
  date: dateArb,
  totalAssets: finDouble,
  totalLiabilities: finDouble,
  totalEquity: nonZeroDouble,
  totalDebt: finDouble,
  bookValuePerShare: nonZeroDouble,
});

const cashFlowStatementArb: fc.Arbitrary<CashFlowStatement> = fc.record({
  date: dateArb,
  operatingCashFlow: finDouble,
  capitalExpenditure: finDouble,
  freeCashFlow: finDouble,
});

const stockQuoteArb: fc.Arbitrary<StockQuote> = fc.record({
  ticker: fc.stringMatching(/^[A-Z]{1,5}$/),
  price: fc.double({ min: 0.01, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  change: finDouble,
  changePercent: fc.double({ min: -100, max: 1000, noNaN: true, noDefaultInfinity: true }),
  volume: fc.integer({ min: 0, max: 2_000_000_000 }),
  timestamp: dateArb.map((d) => `${d}T00:00:00.000Z`),
});

// --- Helpers ---

function findIndicator(name: string, indicators: { name: string; value: number | null; missingFields?: string[] }[]) {
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

describe('Property 5: 缺失欄位正確標註', () => {
  it('empty incomeStatements → EPS and P/E are null with missingFields containing incomeStatements', () => {
    fc.assert(
      fc.property(
        fc.array(balanceSheetArb, { minLength: 1, maxLength: 4 }),
        fc.array(cashFlowStatementArb, { minLength: 1, maxLength: 4 }),
        stockQuoteArb,
        (balanceSheets, cashFlowStatements, quote) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: [],
            balanceSheets,
            cashFlowStatements,
          };

          const result = calculateFundamentals(report, quote);

          // EPS should be null with missingFields containing 'incomeStatements'
          const eps = findIndicator('EPS', result.indicators);
          expect(eps).toBeDefined();
          expect(eps!.value).toBeNull();
          expect(eps!.missingFields).toBeDefined();
          expect(eps!.missingFields).toContain('incomeStatements');

          // P/E should be null with missingFields containing 'incomeStatements'
          const pe = findIndicator('P/E', result.indicators);
          expect(pe).toBeDefined();
          expect(pe!.value).toBeNull();
          expect(pe!.missingFields).toBeDefined();
          expect(pe!.missingFields).toContain('incomeStatements');

          // P/B should still calculate normally (depends on balanceSheets)
          const pb = findIndicator('P/B', result.indicators);
          expect(pb).toBeDefined();
          expect(pb!.value).not.toBeNull();
          const expectedPB = quote.price / balanceSheets[0].bookValuePerShare;
          expect(approxEqual(pb!.value!, expectedPB)).toBe(true);

          // D/E should still calculate normally (depends on balanceSheets)
          const de = findIndicator('D/E', result.indicators);
          expect(de).toBeDefined();
          expect(de!.value).not.toBeNull();
          const expectedDE = balanceSheets[0].totalDebt / balanceSheets[0].totalEquity;
          expect(approxEqual(de!.value!, expectedDE)).toBe(true);

          // FCF should still calculate normally (depends on cashFlowStatements)
          const fcf = findIndicator('FCF', result.indicators);
          expect(fcf).toBeDefined();
          expect(fcf!.value).not.toBeNull();
          const expectedFCF = cashFlowStatements[0].operatingCashFlow - cashFlowStatements[0].capitalExpenditure;
          expect(approxEqual(fcf!.value!, expectedFCF)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty balanceSheets → P/B, ROE, D/E are null with missingFields containing balanceSheets', () => {
    fc.assert(
      fc.property(
        fc.array(incomeStatementArb, { minLength: 1, maxLength: 4 }),
        fc.array(cashFlowStatementArb, { minLength: 1, maxLength: 4 }),
        stockQuoteArb,
        (incomeStatements, cashFlowStatements, quote) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements,
            balanceSheets: [],
            cashFlowStatements,
          };

          const result = calculateFundamentals(report, quote);

          // P/B should be null with missingFields containing 'balanceSheets'
          const pb = findIndicator('P/B', result.indicators);
          expect(pb).toBeDefined();
          expect(pb!.value).toBeNull();
          expect(pb!.missingFields).toBeDefined();
          expect(pb!.missingFields).toContain('balanceSheets');

          // ROE should be null with missingFields containing 'balanceSheets'
          const roe = findIndicator('ROE', result.indicators);
          expect(roe).toBeDefined();
          expect(roe!.value).toBeNull();
          expect(roe!.missingFields).toBeDefined();
          expect(roe!.missingFields).toContain('balanceSheets');

          // D/E should be null with missingFields containing 'balanceSheets'
          const de = findIndicator('D/E', result.indicators);
          expect(de).toBeDefined();
          expect(de!.value).toBeNull();
          expect(de!.missingFields).toBeDefined();
          expect(de!.missingFields).toContain('balanceSheets');

          // EPS should still calculate normally (depends on incomeStatements)
          const eps = findIndicator('EPS', result.indicators);
          expect(eps).toBeDefined();
          expect(eps!.value).not.toBeNull();
          expect(eps!.value).toBe(incomeStatements[0].eps);

          // FCF should still calculate normally (depends on cashFlowStatements)
          const fcf = findIndicator('FCF', result.indicators);
          expect(fcf).toBeDefined();
          expect(fcf!.value).not.toBeNull();
          const expectedFCF = cashFlowStatements[0].operatingCashFlow - cashFlowStatements[0].capitalExpenditure;
          expect(approxEqual(fcf!.value!, expectedFCF)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty cashFlowStatements → FCF is null with missingFields containing cashFlowStatements', () => {
    fc.assert(
      fc.property(
        fc.array(incomeStatementArb, { minLength: 1, maxLength: 4 }),
        fc.array(balanceSheetArb, { minLength: 1, maxLength: 4 }),
        stockQuoteArb,
        (incomeStatements, balanceSheets, quote) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements,
            balanceSheets,
            cashFlowStatements: [],
          };

          const result = calculateFundamentals(report, quote);

          // FCF should be null with missingFields containing 'cashFlowStatements'
          const fcf = findIndicator('FCF', result.indicators);
          expect(fcf).toBeDefined();
          expect(fcf!.value).toBeNull();
          expect(fcf!.missingFields).toBeDefined();
          expect(fcf!.missingFields).toContain('cashFlowStatements');

          // EPS should still calculate normally
          const eps = findIndicator('EPS', result.indicators);
          expect(eps).toBeDefined();
          expect(eps!.value).not.toBeNull();
          expect(eps!.value).toBe(incomeStatements[0].eps);

          // P/B should still calculate normally
          const pb = findIndicator('P/B', result.indicators);
          expect(pb).toBeDefined();
          expect(pb!.value).not.toBeNull();
          const expectedPB = quote.price / balanceSheets[0].bookValuePerShare;
          expect(approxEqual(pb!.value!, expectedPB)).toBe(true);

          // ROE should still calculate normally
          const roe = findIndicator('ROE', result.indicators);
          expect(roe).toBeDefined();
          expect(roe!.value).not.toBeNull();
          const expectedROE = incomeStatements[0].netIncome / balanceSheets[0].totalEquity;
          expect(approxEqual(roe!.value!, expectedROE)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('randomly empty statement arrays → correct indicators are null with correct missingFields', () => {
    fc.assert(
      fc.property(
        fc.record({
          hasIncome: fc.boolean(),
          hasBalance: fc.boolean(),
          hasCashFlow: fc.boolean(),
        }),
        fc.array(incomeStatementArb, { minLength: 1, maxLength: 4 }),
        fc.array(balanceSheetArb, { minLength: 1, maxLength: 4 }),
        fc.array(cashFlowStatementArb, { minLength: 1, maxLength: 4 }),
        stockQuoteArb,
        (flags, incomeData, balanceData, cashFlowData, quote) => {
          const report: FinancialReport = {
            ticker: 'TEST',
            incomeStatements: flags.hasIncome ? incomeData : [],
            balanceSheets: flags.hasBalance ? balanceData : [],
            cashFlowStatements: flags.hasCashFlow ? cashFlowData : [],
          };

          const result = calculateFundamentals(report, quote);

          const eps = findIndicator('EPS', result.indicators)!;
          const pe = findIndicator('P/E', result.indicators)!;
          const pb = findIndicator('P/B', result.indicators)!;
          const roe = findIndicator('ROE', result.indicators)!;
          const de = findIndicator('D/E', result.indicators)!;
          const fcf = findIndicator('FCF', result.indicators)!;

          // EPS depends on incomeStatements
          if (!flags.hasIncome) {
            expect(eps.value).toBeNull();
            expect(eps.missingFields).toContain('incomeStatements');
          } else {
            expect(eps.value).toBe(incomeData[0].eps);
          }

          // P/E depends on incomeStatements
          if (!flags.hasIncome) {
            expect(pe.value).toBeNull();
            expect(pe.missingFields).toContain('incomeStatements');
          } else {
            // P/E calculated normally (eps guaranteed non-zero by generator)
            expect(pe.value).not.toBeNull();
          }

          // P/B depends on balanceSheets
          if (!flags.hasBalance) {
            expect(pb.value).toBeNull();
            expect(pb.missingFields).toContain('balanceSheets');
          } else {
            expect(pb.value).not.toBeNull();
          }

          // ROE depends on BOTH incomeStatements and balanceSheets
          if (!flags.hasIncome || !flags.hasBalance) {
            expect(roe.value).toBeNull();
            expect(roe.missingFields).toBeDefined();
            if (!flags.hasIncome) expect(roe.missingFields).toContain('incomeStatements');
            if (!flags.hasBalance) expect(roe.missingFields).toContain('balanceSheets');
          } else {
            expect(roe.value).not.toBeNull();
          }

          // D/E depends on balanceSheets
          if (!flags.hasBalance) {
            expect(de.value).toBeNull();
            expect(de.missingFields).toContain('balanceSheets');
          } else {
            expect(de.value).not.toBeNull();
          }

          // FCF depends on cashFlowStatements
          if (!flags.hasCashFlow) {
            expect(fcf.value).toBeNull();
            expect(fcf.missingFields).toContain('cashFlowStatements');
          } else {
            expect(fcf.value).not.toBeNull();
          }

          // dataCompleteness should be 'partial' if any indicator is null
          const hasAnyNull = result.indicators.some((i) => i.value === null);
          if (hasAnyNull) {
            expect(result.dataCompleteness).toBe('partial');
          } else {
            expect(result.dataCompleteness).toBe('full');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
