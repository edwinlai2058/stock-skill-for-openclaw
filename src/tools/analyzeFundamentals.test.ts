import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalyzeFundamentals } from './analyzeFundamentals.js';

const sampleFinancialReport = {
  ticker: 'AAPL',
  incomeStatements: [
    { date: '2024-03-31', revenue: 90000, grossProfit: 40000, operatingIncome: 25000, netIncome: 20000, eps: 5.0 },
  ],
  balanceSheets: [
    { date: '2024-03-31', totalAssets: 300000, totalLiabilities: 150000, totalEquity: 150000, totalDebt: 80000, bookValuePerShare: 25 },
  ],
  cashFlowStatements: [
    { date: '2024-03-31', operatingCashFlow: 30000, capitalExpenditure: 5000, freeCashFlow: 25000 },
  ],
};

const sampleQuote = {
  ticker: 'AAPL',
  price: 175,
  change: 2.5,
  changePercent: 1.45,
  volume: 50000000,
  timestamp: '2024-06-01T16:00:00Z',
};

describe('registerAnalyzeFundamentals', () => {
  it('should register the analyze_fundamentals tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerAnalyzeFundamentals(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('analyze_fundamentals');
    expect(mockTool.mock.calls[0][1]).toContain('基本面指標');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('financialReport');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('quote');
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { financialReport: unknown; quote: unknown }) => Promise<unknown>;

    beforeEach(() => {
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerAnalyzeFundamentals(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return FundamentalAnalysis JSON on success', async () => {
      const result = await callback({
        financialReport: sampleFinancialReport,
        quote: sampleQuote,
      }) as { content: { type: string; text: string }[] };

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.indicators).toBeInstanceOf(Array);
      expect(parsed.indicators).toHaveLength(6);
      expect(parsed.dataCompleteness).toBeDefined();
      expect(parsed.trends).toBeDefined();

      const indicatorNames = parsed.indicators.map((i: { name: string }) => i.name);
      expect(indicatorNames).toContain('EPS');
      expect(indicatorNames).toContain('P/E');
      expect(indicatorNames).toContain('P/B');
      expect(indicatorNames).toContain('ROE');
      expect(indicatorNames).toContain('D/E');
      expect(indicatorNames).toContain('FCF');
    });

    it('should compute correct indicator values', async () => {
      const result = await callback({
        financialReport: sampleFinancialReport,
        quote: sampleQuote,
      }) as { content: { type: string; text: string }[] };

      const parsed = JSON.parse(result.content[0].text);
      const byName = Object.fromEntries(
        parsed.indicators.map((i: { name: string; value: number | null }) => [i.name, i.value]),
      );

      expect(byName['EPS']).toBe(5.0);
      expect(byName['P/E']).toBe(175 / 5.0);
      expect(byName['P/B']).toBe(175 / 25);
      expect(byName['ROE']).toBe(20000 / 150000);
      expect(byName['D/E']).toBeCloseTo(80000 / 150000);
      expect(byName['FCF']).toBe(30000 - 5000);
    });

    it('should mark dataCompleteness as full when all data is present', async () => {
      const result = await callback({
        financialReport: sampleFinancialReport,
        quote: sampleQuote,
      }) as { content: { type: string; text: string }[] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.dataCompleteness).toBe('full');
    });

    it('should mark dataCompleteness as partial when data is missing', async () => {
      const emptyReport = {
        ticker: 'AAPL',
        incomeStatements: [],
        balanceSheets: [],
        cashFlowStatements: [],
      };

      const result = await callback({
        financialReport: emptyReport,
        quote: sampleQuote,
      }) as { content: { type: string; text: string }[] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.dataCompleteness).toBe('partial');
    });

    it('should return UNKNOWN_ERROR for unexpected failures', async () => {
      // Force an error by passing something that will cause calculateFundamentals to throw
      const { calculateFundamentals } = await import('../services/analysisEngine.js');
      const origCalc = calculateFundamentals;

      // We mock the module to throw
      vi.spyOn(await import('../services/analysisEngine.js'), 'calculateFundamentals').mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      const result = await callback({
        financialReport: sampleFinancialReport,
        quote: sampleQuote,
      }) as { isError: boolean; content: { type: string; text: string }[] };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('UNKNOWN_ERROR');
      expect(parsed.message).toBe('Unexpected failure');
    });
  });
});
