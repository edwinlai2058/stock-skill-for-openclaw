import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFetchStockQuote } from './fetchStockQuote.js';

describe('registerFetchStockQuote', () => {
  it('should register the fetch_stock_quote tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerFetchStockQuote(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('fetch_stock_quote');
    // Description in Traditional Chinese
    expect(mockTool.mock.calls[0][1]).toContain('即時報價');
    // Params schema with ticker
    expect(mockTool.mock.calls[0][2]).toHaveProperty('ticker');
    // Callback function
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { ticker: string }) => Promise<unknown>;

    beforeEach(() => {
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerFetchStockQuote(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return StockQuote JSON on success', async () => {
      const mockQuote = {
        ticker: 'AAPL',
        price: 185.5,
        change: 2.3,
        changePercent: 1.25,
        volume: 50000000,
        timestamp: '2024-01-15T16:00:00.000Z',
      };

      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue(mockQuote);

      const result = await callback({ ticker: 'AAPL' }) as { content: { type: string; text: string }[] };

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.price).toBe(185.5);
      expect(parsed.change).toBe(2.3);
      expect(parsed.changePercent).toBe(1.25);
      expect(parsed.volume).toBe(50000000);
      expect(parsed.timestamp).toBe('2024-01-15T16:00:00.000Z');
    });

    it('should return TICKER_NOT_FOUND error for TickerNotFoundError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { TickerNotFoundError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockRejectedValue(new TickerNotFoundError('INVALID'));

      const result = await callback({ ticker: 'INVALID' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('TICKER_NOT_FOUND');
      expect(parsed.ticker).toBe('INVALID');
    });

    it('should return DATA_SOURCE_UNAVAILABLE error for DataSourceUnavailableError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { DataSourceUnavailableError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockRejectedValue(new DataSourceUnavailableError('FMP API'));

      const result = await callback({ ticker: 'AAPL' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('DATA_SOURCE_UNAVAILABLE');
      expect(parsed.retryAfter).toBe(60);
    });

    it('should return VALIDATION_ERROR for ValidationError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { ValidationError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockRejectedValue(
        new ValidationError([{ field: 'ticker', reason: '格式不正確' }]),
      );

      const result = await callback({ ticker: '' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('VALIDATION_ERROR');
      expect(parsed.fields).toEqual([{ field: 'ticker', reason: '格式不正確' }]);
    });

    it('should return UNKNOWN_ERROR for unexpected errors', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockRejectedValue(new Error('Unexpected failure'));

      const result = await callback({ ticker: 'AAPL' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('UNKNOWN_ERROR');
      expect(parsed.message).toBe('Unexpected failure');
    });

    it('should call DataFetcher.fetchQuote with the provided ticker', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const fetchQuoteSpy = vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue({
        ticker: 'TSLA',
        price: 250.0,
        change: -3.5,
        changePercent: -1.38,
        volume: 80000000,
        timestamp: '2024-01-15T16:00:00.000Z',
      });

      await callback({ ticker: 'TSLA' });

      expect(fetchQuoteSpy).toHaveBeenCalledWith('TSLA');
    });
  });
});
