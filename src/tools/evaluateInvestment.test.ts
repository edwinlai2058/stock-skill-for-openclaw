import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEvaluateInvestment } from './evaluateInvestment.js';

const sampleAnalysis = {
  ticker: 'AAPL',
  indicators: [
    { name: 'EPS', value: 5.0, description: '每股盈餘（Earnings Per Share）' },
    { name: 'P/E', value: 35.0, description: '本益比（Price-to-Earnings Ratio）= 股價 / EPS' },
    { name: 'P/B', value: 7.0, description: '股價淨值比（Price-to-Book Ratio）= 股價 / 每股淨值' },
    { name: 'ROE', value: 0.133, description: '股東權益報酬率（Return on Equity）= 淨利 / 股東權益' },
    { name: 'D/E', value: 0.533, description: '負債權益比（Debt-to-Equity Ratio）= 總債務 / 股東權益' },
    { name: 'FCF', value: 25000, description: '自由現金流（Free Cash Flow）= 營業現金流 - 資本支出' },
  ],
  trends: {
    revenue: { qoq: 0.05, yoy: 0.1 },
  },
  dataCompleteness: 'full' as const,
};

const partialAnalysis = {
  ticker: 'UNKNOWN',
  indicators: [
    { name: 'EPS', value: null, description: '每股盈餘', missingFields: ['incomeStatements'] },
    { name: 'P/E', value: null, description: '本益比', missingFields: ['incomeStatements'] },
    { name: 'P/B', value: null, description: '股價淨值比', missingFields: ['balanceSheets'] },
    { name: 'ROE', value: null, description: '股東權益報酬率', missingFields: ['incomeStatements', 'balanceSheets'] },
    { name: 'D/E', value: null, description: '負債權益比', missingFields: ['balanceSheets'] },
    { name: 'FCF', value: null, description: '自由現金流', missingFields: ['cashFlowStatements'] },
  ],
  trends: {},
  dataCompleteness: 'partial' as const,
};

describe('registerEvaluateInvestment', () => {
  it('should register the evaluate_investment tool on the server', () => {
    const mockTool = vi.fn();
    const server = { tool: mockTool } as unknown as McpServer;

    registerEvaluateInvestment(server);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toBe('evaluate_investment');
    expect(mockTool.mock.calls[0][1]).toContain('評估投資標的');
    expect(mockTool.mock.calls[0][2]).toHaveProperty('analysis');
    expect(typeof mockTool.mock.calls[0][3]).toBe('function');
  });

  describe('tool callback', () => {
    let callback: (args: { analysis: unknown }) => Promise<unknown>;

    beforeEach(() => {
      const mockTool = vi.fn();
      const server = { tool: mockTool } as unknown as McpServer;
      registerEvaluateInvestment(server);
      callback = mockTool.mock.calls[0][3];
    });

    it('should return AnalysisReport JSON on success', async () => {
      const result = await callback({ analysis: sampleAnalysis }) as {
        content: { type: string; text: string }[];
      };

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.score).toBeGreaterThanOrEqual(0);
      expect(parsed.score).toBeLessThanOrEqual(100);
      expect(parsed.recommendation).toBeDefined();
      expect(parsed.scoringBreakdown).toBeInstanceOf(Array);
      expect(parsed.strengths).toBeInstanceOf(Array);
      expect(parsed.risks).toBeInstanceOf(Array);
      expect(parsed.disclaimer).toBeTruthy();
    });

    it('should set dataConfidence to high when dataCompleteness is full', async () => {
      const result = await callback({ analysis: sampleAnalysis }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.dataConfidence).toBe('high');
    });

    it('should set dataConfidence to low when dataCompleteness is partial', async () => {
      const result = await callback({ analysis: partialAnalysis }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.dataConfidence).toBe('low');
      expect(parsed.missingData).toBeInstanceOf(Array);
      expect(parsed.missingData.length).toBeGreaterThan(0);
    });

    it('should include scoring breakdown with weights summing to 1.0', async () => {
      const result = await callback({ analysis: sampleAnalysis }) as {
        content: { type: string; text: string }[];
      };

      const parsed = JSON.parse(result.content[0].text);
      const totalWeight = parsed.scoringBreakdown.reduce(
        (sum: number, item: { weight: number }) => sum + item.weight,
        0,
      );
      expect(totalWeight).toBeCloseTo(1.0);
    });

    it('should return UNKNOWN_ERROR for unexpected failures', async () => {
      vi.spyOn(await import('../services/analysisEngine.js'), 'evaluateInvestment').mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      const result = await callback({ analysis: sampleAnalysis }) as {
        isError: boolean;
        content: { type: string; text: string }[];
      };

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('UNKNOWN_ERROR');
      expect(parsed.message).toBe('Unexpected failure');
    });
  });
});
