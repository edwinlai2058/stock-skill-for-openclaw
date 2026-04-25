import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DataFetcher } from '../services/dataFetcher.js';
import { TickerNotFoundError, DataSourceUnavailableError, ValidationError } from '../errors/index.js';

/**
 * 註冊 fetch_financial_report 工具到 MCP Server。
 * 擷取指定美股 Ticker 最近四季的財務報表（損益表、資產負債表、現金流量表）。
 */
export function registerFetchFinancialReport(server: McpServer): void {
  server.tool(
    'fetch_financial_report',
    '擷取指定美股公司最近四季的財務報表，包含損益表、資產負債表與現金流量表',
    { ticker: z.string().describe('美股股票代碼，例如 AAPL、TSLA') },
    async ({ ticker }) => {
      try {
        const apiKey = process.env.FMP_API_KEY ?? '';
        const fetcher = new DataFetcher(apiKey);

        const [incomeStatements, balanceSheets, cashFlowStatements] = await Promise.all([
          fetcher.fetchIncomeStatement(ticker),
          fetcher.fetchBalanceSheet(ticker),
          fetcher.fetchCashFlowStatement(ticker),
        ]);

        const report = {
          ticker,
          incomeStatements,
          balanceSheets,
          cashFlowStatements,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
        };
      } catch (error) {
        if (error instanceof TickerNotFoundError) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'TICKER_NOT_FOUND',
                message: error.message,
                ticker: error.ticker,
              }),
            }],
          };
        }

        if (error instanceof DataSourceUnavailableError) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'DATA_SOURCE_UNAVAILABLE',
                message: error.message,
                retryAfter: 60,
              }),
            }],
          };
        }

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
