import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DataFetcher } from '../services/dataFetcher.js';
import { TickerNotFoundError, DataSourceUnavailableError, ValidationError } from '../errors/index.js';

/**
 * 註冊 fetch_price_history 工具到 MCP Server。
 * 擷取指定美股的歷史價格資料，包含每日開盤、收盤、最高、最低價與成交量。
 */
export function registerFetchPriceHistory(server: McpServer): void {
  server.tool(
    'fetch_price_history',
    '擷取指定美股的歷史價格資料，包含每日開盤、收盤、最高、最低價與成交量',
    {
      ticker: z.string().describe('美股股票代碼，例如 AAPL、TSLA'),
      period: z.string().optional().describe('時間範圍，例如 1y（一年）、6m（六個月）、3m（三個月）、1m（一個月），預設為 1y'),
    },
    async ({ ticker, period }) => {
      try {
        const apiKey = process.env.FMP_API_KEY ?? '';
        const fetcher = new DataFetcher(apiKey);
        const priceHistory = await fetcher.fetchPriceHistory(ticker, period);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(priceHistory, null, 2) }],
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
