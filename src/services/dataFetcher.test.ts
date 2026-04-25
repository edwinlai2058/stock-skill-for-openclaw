import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DataFetcher } from './dataFetcher.js';
import { DataSourceUnavailableError, TickerNotFoundError } from '../errors/index.js';
import { IncomeStatementSchema, BalanceSheetSchema, CashFlowStatementSchema, StockQuoteSchema, PriceHistorySchema, DailyPriceSchema } from '../models/index.js';

const BASE = 'https://financialmodelingprep.com/api/v3';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('DataFetcher', () => {
  describe('constructor', () => {
    it('stores apiKey and uses default timeout', () => {
      const fetcher = new DataFetcher('test-key');
      // Verify buildUrl includes the key
      expect(fetcher.buildUrl('/quote/AAPL')).toBe(
        `${BASE}/quote/AAPL?apikey=test-key`,
      );
    });
  });

  describe('buildUrl', () => {
    it('appends apikey with ? when path has no query params', () => {
      const fetcher = new DataFetcher('k');
      expect(fetcher.buildUrl('/quote/AAPL')).toBe(`${BASE}/quote/AAPL?apikey=k`);
    });

    it('appends apikey with & when path already has query params', () => {
      const fetcher = new DataFetcher('k');
      expect(fetcher.buildUrl('/historical-price-full/AAPL?from=2024-01-01')).toBe(
        `${BASE}/historical-price-full/AAPL?from=2024-01-01&apikey=k`,
      );
    });
  });

  describe('fetchWithRetry', () => {
    it('returns parsed JSON on successful response', async () => {
      const payload = { symbol: 'AAPL', price: 150 };
      server.use(
        http.get(`${BASE}/quote/AAPL`, () => HttpResponse.json(payload)),
      );

      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchWithRetry(`${BASE}/quote/AAPL?apikey=key`);
      expect(result).toEqual(payload);
    });

    it('retries once on failure then succeeds', async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE}/quote/AAPL`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.error();
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchWithRetry(`${BASE}/quote/AAPL?apikey=key`);
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(2);
    });

    it('throws DataSourceUnavailableError after retry exhausted', async () => {
      server.use(
        http.get(`${BASE}/quote/AAPL`, () => HttpResponse.error()),
      );

      const fetcher = new DataFetcher('key');
      await expect(
        fetcher.fetchWithRetry(`${BASE}/quote/AAPL?apikey=key`),
      ).rejects.toThrow(DataSourceUnavailableError);
    });

    it('throws DataSourceUnavailableError on non-ok HTTP status after retry', async () => {
      server.use(
        http.get(`${BASE}/quote/AAPL`, () =>
          new HttpResponse(null, { status: 500 }),
        ),
      );

      const fetcher = new DataFetcher('key');
      await expect(
        fetcher.fetchWithRetry(`${BASE}/quote/AAPL?apikey=key`),
      ).rejects.toThrow(DataSourceUnavailableError);
    });

    it('throws DataSourceUnavailableError on timeout after retry', async () => {
      server.use(
        http.get(`${BASE}/quote/AAPL`, async () => {
          // Delay longer than the timeout
          await new Promise((r) => setTimeout(r, 500));
          return HttpResponse.json({ ok: true });
        }),
      );

      // Use a very short timeout to trigger abort
      const fetcher = new DataFetcher('key', 50);
      await expect(
        fetcher.fetchWithRetry(`${BASE}/quote/AAPL?apikey=key`),
      ).rejects.toThrow(DataSourceUnavailableError);
    });
  });

  describe('fetchIncomeStatement', () => {
    const fmpResponse = [
      {
        date: '2024-03-31',
        revenue: 90000000000,
        grossProfit: 42000000000,
        operatingIncome: 28000000000,
        netIncome: 23000000000,
        epsdiluted: 1.53,
        eps: 1.55,
      },
    ];

    it('returns mapped IncomeStatement array on success', async () => {
      server.use(
        http.get(`${BASE}/income-statement/AAPL`, () => HttpResponse.json(fmpResponse)),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchIncomeStatement('AAPL');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date: '2024-03-31',
        revenue: 90000000000,
        grossProfit: 42000000000,
        operatingIncome: 28000000000,
        netIncome: 23000000000,
        eps: 1.53, // prefers epsdiluted
      });
      // Validate against Zod schema
      expect(() => IncomeStatementSchema.parse(result[0])).not.toThrow();
    });

    it('prefers epsdiluted over eps', async () => {
      server.use(
        http.get(`${BASE}/income-statement/AAPL`, () => HttpResponse.json(fmpResponse)),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchIncomeStatement('AAPL');
      expect(result[0].eps).toBe(1.53);
    });

    it('falls back to eps when epsdiluted is missing', async () => {
      server.use(
        http.get(`${BASE}/income-statement/AAPL`, () =>
          HttpResponse.json([{ date: '2024-03-31', revenue: 1, grossProfit: 1, operatingIncome: 1, netIncome: 1, eps: 2.0 }]),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchIncomeStatement('AAPL');
      expect(result[0].eps).toBe(2.0);
    });

    it('throws TickerNotFoundError on empty array', async () => {
      server.use(
        http.get(`${BASE}/income-statement/INVALID`, () => HttpResponse.json([])),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchIncomeStatement('INVALID')).rejects.toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError on error message object', async () => {
      server.use(
        http.get(`${BASE}/income-statement/INVALID`, () =>
          HttpResponse.json({ 'Error Message': 'Invalid API KEY.' }),
        ),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchIncomeStatement('INVALID')).rejects.toThrow(TickerNotFoundError);
    });
  });

  describe('fetchBalanceSheet', () => {
    const fmpResponse = [
      {
        date: '2024-03-31',
        totalAssets: 350000000000,
        totalLiabilities: 280000000000,
        totalStockholdersEquity: 70000000000,
        totalDebt: 110000000000,
        commonStockSharesOutstanding: 15000000000,
      },
    ];

    it('returns mapped BalanceSheet array with calculated bookValuePerShare', async () => {
      server.use(
        http.get(`${BASE}/balance-sheet-statement/AAPL`, () => HttpResponse.json(fmpResponse)),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchBalanceSheet('AAPL');
      expect(result).toHaveLength(1);
      expect(result[0].totalEquity).toBe(70000000000);
      expect(result[0].bookValuePerShare).toBeCloseTo(70000000000 / 15000000000);
      expect(() => BalanceSheetSchema.parse(result[0])).not.toThrow();
    });

    it('sets bookValuePerShare to 0 when shares outstanding is 0', async () => {
      server.use(
        http.get(`${BASE}/balance-sheet-statement/AAPL`, () =>
          HttpResponse.json([{ ...fmpResponse[0], commonStockSharesOutstanding: 0 }]),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchBalanceSheet('AAPL');
      expect(result[0].bookValuePerShare).toBe(0);
    });

    it('throws TickerNotFoundError on empty array', async () => {
      server.use(
        http.get(`${BASE}/balance-sheet-statement/BAD`, () => HttpResponse.json([])),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchBalanceSheet('BAD')).rejects.toThrow(TickerNotFoundError);
    });
  });

  describe('fetchCashFlowStatement', () => {
    const fmpResponse = [
      {
        date: '2024-03-31',
        operatingCashFlow: 30000000000,
        capitalExpenditure: -3000000000,
        freeCashFlow: 27000000000,
      },
    ];

    it('returns mapped CashFlowStatement array on success', async () => {
      server.use(
        http.get(`${BASE}/cash-flow-statement/AAPL`, () => HttpResponse.json(fmpResponse)),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchCashFlowStatement('AAPL');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date: '2024-03-31',
        operatingCashFlow: 30000000000,
        capitalExpenditure: -3000000000,
        freeCashFlow: 27000000000,
      });
      expect(() => CashFlowStatementSchema.parse(result[0])).not.toThrow();
    });

    it('throws TickerNotFoundError on error message object', async () => {
      server.use(
        http.get(`${BASE}/cash-flow-statement/BAD`, () =>
          HttpResponse.json({ 'Error Message': 'Not found' }),
        ),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchCashFlowStatement('BAD')).rejects.toThrow(TickerNotFoundError);
    });
  });

  describe('fetchQuote', () => {
    const fmpQuoteResponse = [
      {
        symbol: 'AAPL',
        price: 189.84,
        change: 2.15,
        changesPercentage: 1.145,
        volume: 54321000,
        timestamp: '2024-06-15T16:00:00.000Z',
      },
    ];

    it('returns mapped StockQuote on success', async () => {
      server.use(
        http.get(`${BASE}/quote/AAPL`, () => HttpResponse.json(fmpQuoteResponse)),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchQuote('AAPL');
      expect(result).toEqual({
        ticker: 'AAPL',
        price: 189.84,
        change: 2.15,
        changePercent: 1.145,
        volume: 54321000,
        timestamp: '2024-06-15T16:00:00.000Z',
      });
      expect(() => StockQuoteSchema.parse(result)).not.toThrow();
    });

    it('uses current ISO string when timestamp is not available', async () => {
      server.use(
        http.get(`${BASE}/quote/MSFT`, () =>
          HttpResponse.json([{ symbol: 'MSFT', price: 420, change: -1.5, changesPercentage: -0.35, volume: 12345000 }]),
        ),
      );
      const fetcher = new DataFetcher('key');
      const before = new Date().toISOString();
      const result = await fetcher.fetchQuote('MSFT');
      const after = new Date().toISOString();
      expect(result.ticker).toBe('MSFT');
      expect(result.timestamp >= before && result.timestamp <= after).toBe(true);
    });

    it('throws TickerNotFoundError on empty array', async () => {
      server.use(
        http.get(`${BASE}/quote/INVALID`, () => HttpResponse.json([])),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchQuote('INVALID')).rejects.toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError on error message object', async () => {
      server.use(
        http.get(`${BASE}/quote/INVALID`, () =>
          HttpResponse.json({ 'Error Message': 'Invalid API KEY.' }),
        ),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchQuote('INVALID')).rejects.toThrow(TickerNotFoundError);
    });
  });

  describe('fetchPriceHistory', () => {
    const fmpHistoricalResponse = {
      symbol: 'AAPL',
      historical: [
        {
          date: '2024-06-14',
          open: 185.0,
          high: 190.0,
          low: 184.5,
          close: 189.84,
          volume: 54321000,
        },
        {
          date: '2024-06-13',
          open: 183.0,
          high: 186.0,
          low: 182.0,
          close: 185.0,
          volume: 43210000,
        },
      ],
    };

    it('returns mapped PriceHistory on success with default 1y period', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/AAPL`, () =>
          HttpResponse.json(fmpHistoricalResponse),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchPriceHistory('AAPL');
      expect(result.ticker).toBe('AAPL');
      expect(result.period).toBe('1y');
      expect(result.prices).toHaveLength(2);
      expect(result.prices[0]).toEqual({
        date: '2024-06-14',
        close: 189.84,
        open: 185.0,
        high: 190.0,
        low: 184.5,
        volume: 54321000,
      });
      // Validate against Zod schemas
      expect(() => PriceHistorySchema.parse(result)).not.toThrow();
      result.prices.forEach((p) => {
        expect(() => DailyPriceSchema.parse(p)).not.toThrow();
      });
    });

    it('uses the specified period string', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/AAPL`, () =>
          HttpResponse.json(fmpHistoricalResponse),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchPriceHistory('AAPL', '6m');
      expect(result.period).toBe('6m');
    });

    it('supports "3m" and "1m" period strings', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/AAPL`, () =>
          HttpResponse.json(fmpHistoricalResponse),
        ),
      );
      const fetcher = new DataFetcher('key');

      const result3m = await fetcher.fetchPriceHistory('AAPL', '3m');
      expect(result3m.period).toBe('3m');

      const result1m = await fetcher.fetchPriceHistory('AAPL', '1m');
      expect(result1m.period).toBe('1m');
    });

    it('throws TickerNotFoundError when historical array is empty', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/INVALID`, () =>
          HttpResponse.json({ symbol: 'INVALID', historical: [] }),
        ),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchPriceHistory('INVALID')).rejects.toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError when response is an error object without historical', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/INVALID`, () =>
          HttpResponse.json({ 'Error Message': 'Invalid API KEY.' }),
        ),
      );
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchPriceHistory('INVALID')).rejects.toThrow(TickerNotFoundError);
    });

    it('maps missing fields to default values', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/AAPL`, () =>
          HttpResponse.json({
            symbol: 'AAPL',
            historical: [{ date: '2024-01-01' }],
          }),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchPriceHistory('AAPL');
      expect(result.prices[0]).toEqual({
        date: '2024-01-01',
        close: 0,
        open: 0,
        high: 0,
        low: 0,
        volume: 0,
      });
    });

    it('falls back to 1y for unrecognized period format', async () => {
      server.use(
        http.get(`${BASE}/historical-price-full/AAPL`, () =>
          HttpResponse.json(fmpHistoricalResponse),
        ),
      );
      const fetcher = new DataFetcher('key');
      const result = await fetcher.fetchPriceHistory('AAPL', 'invalid');
      expect(result.period).toBe('invalid');
      // The from date calculation falls back to 1 year, so the request still works
      expect(result.prices).toHaveLength(2);
    });
  });

  describe('validateTicker', () => {
    const fetcher = new DataFetcher('key');

    it('accepts valid simple tickers', () => {
      expect(() => fetcher.validateTicker('AAPL')).not.toThrow();
      expect(() => fetcher.validateTicker('MSFT')).not.toThrow();
      expect(() => fetcher.validateTicker('A')).not.toThrow();
      expect(() => fetcher.validateTicker('GOOGL')).not.toThrow();
    });

    it('accepts tickers with dot notation (share class)', () => {
      expect(() => fetcher.validateTicker('BRK.B')).not.toThrow();
      expect(() => fetcher.validateTicker('BRK.A')).not.toThrow();
      expect(() => fetcher.validateTicker('BF.B')).not.toThrow();
    });

    it('throws TickerNotFoundError for empty string', () => {
      expect(() => fetcher.validateTicker('')).toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError for whitespace-only string', () => {
      expect(() => fetcher.validateTicker('   ')).toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError for strings with special characters', () => {
      expect(() => fetcher.validateTicker('AA@L')).toThrow(TickerNotFoundError);
      expect(() => fetcher.validateTicker('$AAPL')).toThrow(TickerNotFoundError);
      expect(() => fetcher.validateTicker('AA-PL')).toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError for pure numbers', () => {
      expect(() => fetcher.validateTicker('12345')).toThrow(TickerNotFoundError);
      expect(() => fetcher.validateTicker('0')).toThrow(TickerNotFoundError);
    });

    it('throws TickerNotFoundError for strings exceeding 5 letters', () => {
      expect(() => fetcher.validateTicker('ABCDEF')).toThrow(TickerNotFoundError);
      expect(() => fetcher.validateTicker('TOOLONG')).toThrow(TickerNotFoundError);
    });

    it('accepts lowercase letters by normalizing to uppercase', () => {
      expect(() => fetcher.validateTicker('aapl')).not.toThrow();
      expect(() => fetcher.validateTicker('Aapl')).not.toThrow();
    });

    it('throws TickerNotFoundError for mixed alphanumeric', () => {
      expect(() => fetcher.validateTicker('A1B2')).toThrow(TickerNotFoundError);
    });

    it('includes the ticker in the error', () => {
      try {
        fetcher.validateTicker('bad!');
      } catch (e) {
        expect(e).toBeInstanceOf(TickerNotFoundError);
        expect((e as TickerNotFoundError).ticker).toBe('bad!');
      }
    });
  });

  describe('ticker validation integration with fetch methods', () => {
    it('fetchIncomeStatement rejects invalid ticker before API call', async () => {
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchIncomeStatement('')).rejects.toThrow(TickerNotFoundError);
      await expect(fetcher.fetchIncomeStatement('123')).rejects.toThrow(TickerNotFoundError);
    });

    it('fetchBalanceSheet rejects invalid ticker before API call', async () => {
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchBalanceSheet('$BAD')).rejects.toThrow(TickerNotFoundError);
    });

    it('fetchCashFlowStatement rejects invalid ticker before API call', async () => {
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchCashFlowStatement('toolong')).rejects.toThrow(TickerNotFoundError);
    });

    it('fetchQuote rejects invalid ticker before API call', async () => {
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchQuote('A@B')).rejects.toThrow(TickerNotFoundError);
    });

    it('fetchPriceHistory rejects invalid ticker before API call', async () => {
      const fetcher = new DataFetcher('key');
      await expect(fetcher.fetchPriceHistory('12345')).rejects.toThrow(TickerNotFoundError);
    });
  });
});
