import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFetchFinancialReport } from './fetchFinancialReport.js';

describe('registerFetchFinancialReport', () => {
  it('should register the fetch_financial_report tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerFetchFinancialReport(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('fetch_financial_report');
    // Second arg is the description (Traditional Chinese)
    expect(mockTool.mock.calls[0][1]).toContain('財務報表');
    // Third arg is the params schema object with ticker
    expect(mockTool.mock.calls[0][2]).toHaveProperty('ticker');
    // Fourth arg is the callback function
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { ticker: string }) => Promise<unknown>;

    beforeEach(() => {
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerFetchFinancialReport(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return FinancialReport JSON on success', async () => {
      const mockIncomeStatements = [{ date: '2024-01-01', revenue: 1000, grossProfit: 500, operatingIncome: 300, netIncome: 200, eps: 2.5 }];
      const mockBalanceSheets = [{ date: '2024-01-01', totalAssets: 5000, totalLiabilities: 2000, totalEquity: 3000, totalDebt: 1000, bookValuePerShare: 30 }];
      const mockCashFlows = [{ date: '2024-01-01', operatingCashFlow: 400, capitalExpenditure: -100, freeCashFlow: 300 }];

      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockResolvedValue(mockIncomeStatements);
      vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue(mockBalanceSheets);
      vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue(mockCashFlows);

      const result = await callback({ ticker: 'AAPL' }) as { content: { type: string; text: string }[] };

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.incomeStatements).toEqual(mockIncomeStatements);
      expect(parsed.balanceSheets).toEqual(mockBalanceSheets);
      expect(parsed.cashFlowStatements).toEqual(mockCashFlows);
    });

    it('should return TICKER_NOT_FOUND error for TickerNotFoundError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { TickerNotFoundError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockRejectedValue(new TickerNotFoundError('INVALID'));

      const result = await callback({ ticker: 'INVALID' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('TICKER_NOT_FOUND');
      expect(parsed.ticker).toBe('INVALID');
    });

    it('should return DATA_SOURCE_UNAVAILABLE error for DataSourceUnavailableError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { DataSourceUnavailableError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockRejectedValue(new DataSourceUnavailableError('FMP API'));

      const result = await callback({ ticker: 'AAPL' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('DATA_SOURCE_UNAVAILABLE');
      expect(parsed.retryAfter).toBe(60);
    });

    it('should return VALIDATION_ERROR for ValidationError', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { ValidationError } = await import('../errors/index.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockRejectedValue(
        new ValidationError([{ field: 'ticker', reason: '格式不正確' }]),
      );

      const result = await callback({ ticker: '' }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('VALIDATION_ERROR');
      expect(parsed.fields).toEqual([{ field: 'ticker', reason: '格式不正確' }]);
    });

    it('should call all three fetch methods in parallel', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');

      const incomespy = vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockResolvedValue([]);
      const balancespy = vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue([]);
      const cashflowspy = vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue([]);

      await callback({ ticker: 'MSFT' });

      expect(incomespy).toHaveBeenCalledWith('MSFT');
      expect(balancespy).toHaveBeenCalledWith('MSFT');
      expect(cashflowspy).toHaveBeenCalledWith('MSFT');
    });
  });
});
