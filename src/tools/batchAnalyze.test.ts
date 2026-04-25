import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBatchAnalyze } from './batchAnalyze.js';

const mockIncomeStatements = [
  { date: '2024-03-31', revenue: 100000, grossProfit: 50000, operatingIncome: 30000, netIncome: 20000, eps: 5.0 },
  { date: '2023-12-31', revenue: 95000, grossProfit: 47000, operatingIncome: 28000, netIncome: 18000, eps: 4.5 },
];
const mockBalanceSheets = [
  { date: '2024-03-31', totalAssets: 500000, totalLiabilities: 200000, totalEquity: 300000, totalDebt: 80000, bookValuePerShare: 25 },
];
const mockCashFlows = [
  { date: '2024-03-31', operatingCashFlow: 40000, capitalExpenditure: 10000, freeCashFlow: 30000 },
];
const mockQuote = {
  ticker: 'AAPL',
  price: 175,
  change: 2.5,
  changePercent: 1.45,
  volume: 50000000,
  timestamp: '2024-06-01T16:00:00Z',
};

describe('registerBatchAnalyze', () => {
  it('should register the batch_analyze tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerBatchAnalyze(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('batch_analyze');
    expect(mockTool.mock.calls[0][1]).toContain('批次分析');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('tickers');
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { tickers: string[] }) => Promise<unknown>;

    beforeEach(() => {
      vi.restoreAllMocks();
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerBatchAnalyze(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return VALIDATION_ERROR for empty tickers array', async () => {
      const result = await callback({ tickers: [] }) as {
        isError: boolean;
        content: { type: string; text: string }[];
      };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('VALIDATION_ERROR');
      expect(parsed.fields[0].field).toBe('tickers');
      expect(parsed.fields[0].reason).toContain('不可為空');
    });

    it('should return VALIDATION_ERROR when tickers exceed 20', async () => {
      const tickers = Array.from({ length: 21 }, (_, i) => `T${i}`);
      const result = await callback({ tickers }) as {
        isError: boolean;
        content: { type: string; text: string }[];
      };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('VALIDATION_ERROR');
      expect(parsed.fields[0].field).toBe('tickers');
      expect(parsed.fields[0].reason).toContain('20');
    });

    it('should return BatchReport with progress on success', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockResolvedValue(mockIncomeStatements);
      vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue(mockBalanceSheets);
      vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue(mockCashFlows);
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue(mockQuote);

      const result = await callback({ tickers: ['AAPL'] }) as {
        content: { type: string; text: string }[];
      };

      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalRequested).toBe(1);
      expect(parsed.totalCompleted).toBe(1);
      expect(parsed.totalFailed).toBe(0);
      expect(parsed.rankings).toHaveLength(1);
      expect(parsed.rankings[0].ticker).toBe('AAPL');
      expect(parsed.failedTickers).toHaveLength(0);
      expect(parsed.progress).toBe('已完成 1/1 檔分析');
    });

    it('should handle partial failures gracefully', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      const { TickerNotFoundError } = await import('../errors/index.js');

      // AAPL succeeds
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockImplementation(async (ticker: string) => {
        if (ticker === 'INVALID') throw new TickerNotFoundError('INVALID');
        return mockIncomeStatements;
      });
      vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue(mockBalanceSheets);
      vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue(mockCashFlows);
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue(mockQuote);

      const result = await callback({ tickers: ['AAPL', 'INVALID'] }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalRequested).toBe(2);
      expect(parsed.totalCompleted).toBe(1);
      expect(parsed.totalFailed).toBe(1);
      expect(parsed.rankings).toHaveLength(1);
      expect(parsed.failedTickers).toHaveLength(1);
      expect(parsed.failedTickers[0].ticker).toBe('INVALID');
      expect(parsed.failedTickers[0].reason).toContain('INVALID');
      expect(parsed.progress).toBe('已完成 1/2 檔分析');
    });

    it('should process exactly 20 tickers without error', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockResolvedValue(mockIncomeStatements);
      vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue(mockBalanceSheets);
      vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue(mockCashFlows);
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue(mockQuote);

      const tickers = Array.from({ length: 20 }, (_, i) => `T${String(i).padStart(2, '0')}`);
      const result = await callback({ tickers }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalRequested).toBe(20);
      expect(parsed.totalCompleted).toBe(20);
      expect(parsed.totalFailed).toBe(0);
      expect(parsed.progress).toBe('已完成 20/20 檔分析');
    });

    it('should rank results by score descending', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');

      // Return different data for different tickers to get different scores
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockResolvedValue(mockIncomeStatements);
      vi.spyOn(DataFetcher.prototype, 'fetchBalanceSheet').mockResolvedValue(mockBalanceSheets);
      vi.spyOn(DataFetcher.prototype, 'fetchCashFlowStatement').mockResolvedValue(mockCashFlows);
      vi.spyOn(DataFetcher.prototype, 'fetchQuote').mockResolvedValue(mockQuote);

      const result = await callback({ tickers: ['AAPL', 'TSLA'] }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      const scores = parsed.rankings.map((r: { score: number }) => r.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    it('should record all failures when all tickers fail', async () => {
      const { DataFetcher } = await import('../services/dataFetcher.js');
      vi.spyOn(DataFetcher.prototype, 'fetchIncomeStatement').mockRejectedValue(new Error('API down'));

      const result = await callback({ tickers: ['AAPL', 'TSLA'] }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalRequested).toBe(2);
      expect(parsed.totalCompleted).toBe(0);
      expect(parsed.totalFailed).toBe(2);
      expect(parsed.rankings).toHaveLength(0);
      expect(parsed.failedTickers).toHaveLength(2);
      expect(parsed.progress).toBe('已完成 0/2 檔分析');
    });
  });
});
