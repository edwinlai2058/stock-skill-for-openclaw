import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DataFetcher } from '../services/dataFetcher.js';
import {
  calculateFundamentals,
  evaluateInvestment,
  generateBatchSummary,
} from '../services/analysisEngine.js';
import { ValidationError } from '../errors/index.js';
import type { AnalysisReport, FailedTicker } from '../models/analysis.js';

const MAX_TICKERS = 20;

/**
 * 註冊 batch_analyze 工具到 MCP Server。
 * 批次分析多檔美股，依序執行財務報表擷取、基本面分析與投資評估，產出彙總報告。
 */
export function registerBatchAnalyze(server: McpServer): void {
  server.tool(
    'batch_analyze',
    '批次分析多檔美股，依序執行財務報表擷取、基本面分析與投資評估，產出彙總報告',
    {
      tickers: z
        .array(z.string())
        .describe('美股股票代碼清單，例如 ["AAPL", "TSLA"]，最多 20 檔'),
    },
    async ({ tickers }) => {
      // Validate: empty array
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'VALIDATION_ERROR',
              message: '輸入參數驗證失敗',
              fields: [{ field: 'tickers', reason: 'tickers 陣列不可為空' }],
            }),
          }],
        };
      }

      // Validate: max 20 items
      if (tickers.length > MAX_TICKERS) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'VALIDATION_ERROR',
              message: '輸入參數驗證失敗',
              fields: [{ field: 'tickers', reason: `tickers 陣列最多 ${MAX_TICKERS} 檔，目前為 ${tickers.length} 檔` }],
            }),
          }],
        };
      }

      const apiKey = process.env.FMP_API_KEY ?? '';
      const fetcher = new DataFetcher(apiKey);
      const reports: AnalysisReport[] = [];
      const failedTickers: FailedTicker[] = [];

      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        try {
          // Fetch financial reports in parallel
          const [incomeStatements, balanceSheets, cashFlowStatements] = await Promise.all([
            fetcher.fetchIncomeStatement(ticker),
            fetcher.fetchBalanceSheet(ticker),
            fetcher.fetchCashFlowStatement(ticker),
          ]);

          const financialReport = {
            ticker,
            incomeStatements,
            balanceSheets,
            cashFlowStatements,
          };

          // Fetch quote
          const quote = await fetcher.fetchQuote(ticker);

          // Calculate fundamentals
          const analysis = calculateFundamentals(financialReport, quote);

          // Evaluate investment
          const report = evaluateInvestment(analysis);
          reports.push(report);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failedTickers.push({ ticker, reason });
        }
      }

      // Generate batch summary
      const batchReport = generateBatchSummary(reports, failedTickers);
      const progress = `已完成 ${reports.length}/${tickers.length} 檔分析`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ...batchReport, progress }, null, 2),
        }],
      };
    },
  );
}
