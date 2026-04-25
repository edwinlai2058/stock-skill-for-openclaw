import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  registerFetchFinancialReport,
  registerFetchStockQuote,
  registerFetchPriceHistory,
  registerAnalyzeFundamentals,
  registerEvaluateInvestment,
  registerBatchAnalyze,
} from '../../tools/index.js';

describe('MCP Server 整合測試', () => {
  describe('工具註冊', () => {
    const toolNames = [
      'fetch_financial_report',
      'fetch_stock_quote',
      'fetch_price_history',
      'analyze_fundamentals',
      'evaluate_investment',
      'batch_analyze',
    ];

    it('所有 6 個工具的註冊函式應可正常呼叫而不拋出錯誤', () => {
      const server = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });

      expect(() => registerFetchFinancialReport(server)).not.toThrow();
      expect(() => registerFetchStockQuote(server)).not.toThrow();
      expect(() => registerFetchPriceHistory(server)).not.toThrow();
      expect(() => registerAnalyzeFundamentals(server)).not.toThrow();
      expect(() => registerEvaluateInvestment(server)).not.toThrow();
      expect(() => registerBatchAnalyze(server)).not.toThrow();
    });

    it('應正確匯出 6 個註冊函式', () => {
      expect(typeof registerFetchFinancialReport).toBe('function');
      expect(typeof registerFetchStockQuote).toBe('function');
      expect(typeof registerFetchPriceHistory).toBe('function');
      expect(typeof registerAnalyzeFundamentals).toBe('function');
      expect(typeof registerEvaluateInvestment).toBe('function');
      expect(typeof registerBatchAnalyze).toBe('function');
    });
  });

  describe('Skill 檔案內容驗證', () => {
    let skillContent: string;

    beforeAll(async () => {
      const skillPath = resolve(process.cwd(), 'skill.md');
      skillContent = await readFile(skillPath, 'utf-8');
    });

    it('skill.md 檔案應存在且非空', () => {
      expect(skillContent).toBeDefined();
      expect(skillContent.length).toBeGreaterThan(0);
    });

    it('應包含 AI 代理角色定義（美股分析助手）', () => {
      expect(skillContent).toContain('美股分析助手');
    });

    it('應包含完整的分析流程指引（步驟一至步驟四）', () => {
      expect(skillContent).toContain('步驟一');
      expect(skillContent).toContain('步驟二');
      expect(skillContent).toContain('步驟三');
      expect(skillContent).toContain('步驟四');
    });

    it('應包含繁體中文語言設定', () => {
      expect(skillContent).toContain('繁體中文');
    });

    it('應包含免責聲明文字', () => {
      expect(skillContent).toContain('本分析報告僅供參考');
    });

    it('應包含觸發關鍵字', () => {
      expect(skillContent).toContain('美股分析');
      expect(skillContent).toContain('股票推薦');
      expect(skillContent).toContain('財報分析');
    });
  });
});
