import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFetchPriceHistory } from './fetchPriceHistory.js';

describe('registerFetchPriceHistory', () => {
  it('should register the fetch_price_history tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerFetchPriceHistory(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('fetch_price_history');
    expect(mockTool.mock.calls[0][1]).toContain('歷史價格');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('ticker');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('period');
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { ticker: string; period?: string }) => Promise<unknown>;

    beforeEach(() => {
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerFetchPriceHistory(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return PriceHistory JSON on success', async () => {
      const mockPriceHistory = {
        ticker: 'AAPL',
        period: '1y',
        prices: [
          { date: '2024-01-15', close: 185.5, open: 183.0, high: 186.0, low: 182.5, volume: 50000000 },
          { date: '2024-01-14', close: 183.0, open: 181.0, high: 184.0, low: 180.5, volume: 45000000 },
        ],
      };

      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockResolvedValue(mockPriceHistory);

      const result = await callback({ ticker: 'AAPL' }) as { content: { type: string; text: string }[] };

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.period).toBe('1y');
      expect(parsed.prices).toHaveLength(2);
      expect(parsed.prices[0].close).toBe(185.5);
    });

    it('should pass period to DataFetcher.fetchPriceHistory when provided', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const fetchSpy = vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockResolvedValue({
        ticker: 'AAPL',
        period: '6m',
        prices: [],
      });

      await callback({ ticker: 'AAPL', period: '6m' });

      expect(fetchSpy).toHaveBeenCalledWith('AAPL', '6m');
    });

    it('should pass undefined period when not provided (defaults handled by DataFetcher)', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const fetchSpy = vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockResolvedValue({
        ticker: 'TSLA',
        period: '1y',
        prices: [],
      });

      await callback({ ticker: 'TSLA' });

      expect(fetchSpy).toHaveBeenCalledWith('TSLA', undefined);
    });

    it('should return TICKER_NOT_FOUND error for TickerNotFoundError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { TickerNotFoundError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockRejectedValue(new TickerNotFoundError('INVALID'));

      const result = await callback({ ticker: 'INVALID' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('TICKER_NOT_FOUND');
      expect(parsed.ticker).toBe('INVALID');
    });

    it('should return DATA_SOURCE_UNAVAILABLE error for DataSourceUnavailableError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { DataSourceUnavailableError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockRejectedValue(new DataSourceUnavailableError('FMP API'));

      const result = await callback({ ticker: 'AAPL' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('DATA_SOURCE_UNAVAILABLE');
      expect(parsed.retryAfter).toBe(60);
    });

    it('should return VALIDATION_ERROR for ValidationError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { ValidationError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockRejectedValue(
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
      vi.spyOn(DataFetcher.prototype, 'fetchPriceHistory').mockRejectedValue(new Error('Unexpected failure'));

      const result = await callback({ ticker: 'AAPL' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('UNKNOWN_ERROR');
      expect(parsed.message).toBe('Unexpected failure');
    });
  });
});
