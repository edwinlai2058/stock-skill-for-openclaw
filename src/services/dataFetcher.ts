import {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  StockQuote,
  PriceHistory,
} from '../models/index.js';
import { DataSourceUnavailableError, TickerNotFoundError } from '../errors/index.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * Regex for valid US stock tickers: 1-5 uppercase letters, optionally with a single dot
 * for share class notation (e.g., BRK.B). The dot does not count toward the 5-char limit.
 */
const VALID_TICKER_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

export class DataFetcher {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Validates that a ticker string conforms to valid US stock ticker format.
   * Throws TickerNotFoundError for invalid tickers.
   *
   * Valid format: 1-5 uppercase letters (A-Z), optionally with a dot for share class (e.g., BRK.B).
   */
  validateTicker(ticker: string): void {
    if (!ticker || typeof ticker !== 'string') {
      throw new TickerNotFoundError(String(ticker));
    }

    const normalized = ticker.trim().toUpperCase();

    if (normalized.length === 0) {
      throw new TickerNotFoundError(ticker);
    }

    if (!VALID_TICKER_REGEX.test(normalized)) {
      throw new TickerNotFoundError(ticker);
    }
  }

  /**
   * Makes an HTTP GET request with timeout and one retry on failure.
   * Throws DataSourceUnavailableError after the retry is exhausted.
   */
  async fetchWithRetry(url: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return await response.json();
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await this.delay(RETRY_DELAY_MS);
        }
      }
    }

    throw new DataSourceUnavailableError(
      `Financial Modeling Prep API (${lastError instanceof Error ? lastError.message : String(lastError)})`,
    );
  }

  /** Builds a full API URL with the API key appended. */
  buildUrl(path: string): string {
    const separator = path.includes('?') ? '&' : '?';
    return `${BASE_URL}${path}${separator}apikey=${this.apiKey}`;
  }

  /**
   * Validates that the API response is a non-empty array.
   * FMP returns { "Error Message": "..." } for invalid tickers or an empty array.
   */
  private validateApiResponseArray(data: unknown, ticker: string): Record<string, unknown>[] {
    if (!Array.isArray(data)) {
      throw new TickerNotFoundError(ticker);
    }
    if (data.length === 0) {
      throw new TickerNotFoundError(ticker);
    }
    return data as Record<string, unknown>[];
  }

  async fetchIncomeStatement(ticker: string): Promise<IncomeStatement[]> {
    this.validateTicker(ticker);
    const url = this.buildUrl(`/income-statement/${ticker}?period=quarter&limit=4`);
    const raw = await this.fetchWithRetry(url);
    const items = this.validateApiResponseArray(raw, ticker);

    return items.map((item: Record<string, unknown>) => ({
      date: String(item.date ?? ''),
      revenue: Number(item.revenue ?? 0),
      grossProfit: Number(item.grossProfit ?? 0),
      operatingIncome: Number(item.operatingIncome ?? 0),
      netIncome: Number(item.netIncome ?? 0),
      eps: Number(item.epsdiluted ?? item.eps ?? 0),
    }));
  }

  async fetchBalanceSheet(ticker: string): Promise<BalanceSheet[]> {
    this.validateTicker(ticker);
    const url = this.buildUrl(`/balance-sheet-statement/${ticker}?period=quarter&limit=4`);
    const raw = await this.fetchWithRetry(url);
    const items = this.validateApiResponseArray(raw, ticker);

    return items.map((item: Record<string, unknown>) => {
      const totalEquity = Number(item.totalStockholdersEquity ?? 0);
      const shares = Number(item.commonStockSharesOutstanding ?? 0);
      const rawBVPS = shares > 0 ? totalEquity / shares : 0;
      const bookValuePerShare = Number.isFinite(rawBVPS) ? rawBVPS : 0;

      return {
        date: String(item.date ?? ''),
        totalAssets: Number(item.totalAssets ?? 0),
        totalLiabilities: Number(item.totalLiabilities ?? 0),
        totalEquity,
        totalDebt: Number(item.totalDebt ?? 0),
        bookValuePerShare,
      };
    });
  }

  async fetchCashFlowStatement(ticker: string): Promise<CashFlowStatement[]> {
    this.validateTicker(ticker);
    const url = this.buildUrl(`/cash-flow-statement/${ticker}?period=quarter&limit=4`);
    const raw = await this.fetchWithRetry(url);
    const items = this.validateApiResponseArray(raw, ticker);

    return items.map((item: Record<string, unknown>) => ({
      date: String(item.date ?? ''),
      operatingCashFlow: Number(item.operatingCashFlow ?? 0),
      capitalExpenditure: Number(item.capitalExpenditure ?? 0),
      freeCashFlow: Number(item.freeCashFlow ?? 0),
    }));
  }

  async fetchQuote(ticker: string): Promise<StockQuote> {
    this.validateTicker(ticker);
    const url = this.buildUrl(`/quote/${ticker}`);
    const raw = await this.fetchWithRetry(url);
    const items = this.validateApiResponseArray(raw, ticker);
    const item = items[0] as Record<string, unknown>;

    return {
      ticker: String(item.symbol ?? ticker),
      price: Number(item.price ?? 0),
      change: Number(item.change ?? 0),
      changePercent: Number(item.changesPercentage ?? 0),
      volume: Number(item.volume ?? 0),
      timestamp: item.timestamp ? String(item.timestamp) : new Date().toISOString(),
    };
  }

  async fetchPriceHistory(ticker: string, period?: string): Promise<PriceHistory> {
    this.validateTicker(ticker);
    const resolvedPeriod = period ?? '1y';
    const to = new Date();
    const from = this.calculateFromDate(to, resolvedPeriod);

    const toStr = this.formatDate(to);
    const fromStr = this.formatDate(from);

    const url = this.buildUrl(`/historical-price-full/${ticker}?from=${fromStr}&to=${toStr}`);
    const raw = await this.fetchWithRetry(url);

    const data = raw as Record<string, unknown>;

    // FMP returns { "symbol": "...", "historical": [...] } or an error object
    const historical = data.historical;
    if (!Array.isArray(historical) || historical.length === 0) {
      throw new TickerNotFoundError(ticker);
    }

    const prices = historical.map((item: Record<string, unknown>) => ({
      date: String(item.date ?? ''),
      close: Number(item.close ?? 0),
      open: Number(item.open ?? 0),
      high: Number(item.high ?? 0),
      low: Number(item.low ?? 0),
      volume: Number(item.volume ?? 0),
    }));

    return {
      ticker,
      period: resolvedPeriod,
      prices,
    };
  }

  /** Calculates the start date based on a period string like "1y", "6m", "3m", "1m". */
  private calculateFromDate(to: Date, period: string): Date {
    const from = new Date(to);
    const match = period.match(/^(\d+)(y|m)$/);
    if (!match) {
      // Default to 1 year for unrecognized periods
      from.setFullYear(from.getFullYear() - 1);
      return from;
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'y') {
      from.setFullYear(from.getFullYear() - amount);
    } else {
      from.setMonth(from.getMonth() - amount);
    }

    return from;
  }

  /** Formats a Date as YYYY-MM-DD. */
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
