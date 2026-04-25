// Feature: openclaw-stock-analysis-skill, Property 1: 資料轉換產出有效結構
// **Validates: Requirements 1.4, 2.4**

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { DataFetcher } from '../../services/dataFetcher.js';
import {
  IncomeStatementSchema,
  BalanceSheetSchema,
  CashFlowStatementSchema,
  StockQuoteSchema,
  PriceHistorySchema,
} from '../../models/index.js';

// --- Arbitraries for FMP-shaped raw API responses ---

/** Generates a random FMP income statement item (raw API shape). */
const fmpIncomeStatementItemArb = fc.record({
  date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().slice(0, 10)),
  revenue: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  grossProfit: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  operatingIncome: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  netIncome: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  epsdiluted: fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
  eps: fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
});

/** Generates a random FMP balance sheet item (raw API shape). */
const fmpBalanceSheetItemArb = fc.record({
  date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().slice(0, 10)),
  totalAssets: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  totalLiabilities: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  totalStockholdersEquity: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  totalDebt: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  commonStockSharesOutstanding: fc.double({ min: 0, max: 1e12, noNaN: true, noDefaultInfinity: true }),
});

/** Generates a random FMP cash flow statement item (raw API shape). */
const fmpCashFlowItemArb = fc.record({
  date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().slice(0, 10)),
  operatingCashFlow: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  capitalExpenditure: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
  freeCashFlow: fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
});

/** Generates a random FMP quote item (raw API shape). */
const fmpQuoteItemArb = fc.record({
  symbol: fc.stringMatching(/^[A-Z]{1,5}$/),
  price: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  change: fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
  changesPercentage: fc.double({ min: -100, max: 1000, noNaN: true, noDefaultInfinity: true }),
  volume: fc.integer({ min: 0, max: 2_000_000_000 }),
  timestamp: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
});

/** Generates a random FMP historical price item (raw API shape). */
const fmpHistoricalPriceItemArb = fc.record({
  date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().slice(0, 10)),
  open: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  high: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  low: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  close: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  volume: fc.integer({ min: 0, max: 2_000_000_000 }),
});

describe('Property 1: 資料轉換產出有效結構', () => {
  /**
   * Helper: creates a DataFetcher with fetchWithRetry mocked to return the given data.
   */
  function createMockedFetcher(mockReturnValue: unknown): DataFetcher {
    const fetcher = new DataFetcher('test-key');
    vi.spyOn(fetcher, 'fetchWithRetry').mockResolvedValue(mockReturnValue);
    return fetcher;
  }

  it('fetchIncomeStatement transforms random FMP data into valid IncomeStatement[]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fmpIncomeStatementItemArb, { minLength: 1, maxLength: 4 }),
        async (rawItems) => {
          const fetcher = createMockedFetcher(rawItems);
          const result = await fetcher.fetchIncomeStatement('AAPL');

          expect(result).toHaveLength(rawItems.length);
          for (const item of result) {
            const parsed = IncomeStatementSchema.safeParse(item);
            expect(parsed.success).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fetchBalanceSheet transforms random FMP data into valid BalanceSheet[]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fmpBalanceSheetItemArb, { minLength: 1, maxLength: 4 }),
        async (rawItems) => {
          const fetcher = createMockedFetcher(rawItems);
          const result = await fetcher.fetchBalanceSheet('AAPL');

          expect(result).toHaveLength(rawItems.length);
          for (const item of result) {
            const parsed = BalanceSheetSchema.safeParse(item);
            expect(parsed.success).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fetchCashFlowStatement transforms random FMP data into valid CashFlowStatement[]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fmpCashFlowItemArb, { minLength: 1, maxLength: 4 }),
        async (rawItems) => {
          const fetcher = createMockedFetcher(rawItems);
          const result = await fetcher.fetchCashFlowStatement('AAPL');

          expect(result).toHaveLength(rawItems.length);
          for (const item of result) {
            const parsed = CashFlowStatementSchema.safeParse(item);
            expect(parsed.success).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fetchQuote transforms random FMP data into valid StockQuote', async () => {
    await fc.assert(
      fc.asyncProperty(fmpQuoteItemArb, async (rawItem) => {
        const fetcher = createMockedFetcher([rawItem]);
        const result = await fetcher.fetchQuote('AAPL');

        const parsed = StockQuoteSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('fetchPriceHistory transforms random FMP data into valid PriceHistory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fmpHistoricalPriceItemArb, { minLength: 1, maxLength: 20 }),
        async (rawPrices) => {
          const fetcher = createMockedFetcher({
            symbol: 'AAPL',
            historical: rawPrices,
          });
          const result = await fetcher.fetchPriceHistory('AAPL');

          const parsed = PriceHistorySchema.safeParse(result);
          expect(parsed.success).toBe(true);
          expect(result.prices).toHaveLength(rawPrices.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
