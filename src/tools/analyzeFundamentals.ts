import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FinancialReportSchema } from '../models/financial.js';
import { StockQuoteSchema } from '../models/price.js';
import { calculateFundamentals } from '../services/analysisEngine.js';
import { ValidationError } from '../errors/index.js';

/**
 * 註冊 analyze_fundamentals 工具到 MCP Server。
 * 分析指定股票的基本面指標，計算 EPS、P/E、P/B、ROE、D/E、FCF 等關鍵指標與趨勢。
 */
export function registerAnalyzeFundamentals(server: McpServer): void {
  server.tool(
    'analyze_fundamentals',
    '分析指定股票的基本面指標，計算 EPS、P/E、P/B、ROE、D/E、FCF 等關鍵指標與趨勢',
    {
      financialReport: FinancialReportSchema.describe('財務報表資料，包含損益表、資產負債表與現金流量表'),
      quote: StockQuoteSchema.describe('即時報價資料，包含現價、漲跌幅、成交量'),
    },
    async ({ financialReport, quote }) => {
      try {
        const result = calculateFundamentals(financialReport, quote);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        if (error instanceof ValidationError) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'VALIDATION_ERROR',
                message: error.message,
                fields: error.fields,
              }),
            }],
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'UNKNOWN_ERROR', message }) }],
        };
      }
    },
  );
}
