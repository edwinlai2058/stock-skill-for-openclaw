import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FundamentalAnalysisSchema } from '../models/analysis.js';
import { evaluateInvestment } from '../services/analysisEngine.js';
import { ValidationError } from '../errors/index.js';

/**
 * 註冊 evaluate_investment 工具到 MCP Server。
 * 根據基本面分析結果評估投資標的，產出綜合評分、投資建議與優勢/風險摘要。
 */
export function registerEvaluateInvestment(server: McpServer): void {
  server.tool(
    'evaluate_investment',
    '根據基本面分析結果評估投資標的，產出綜合評分、投資建議與優勢/風險摘要',
    {
      analysis: FundamentalAnalysisSchema.describe('基本面分析結果，包含指標、趨勢與資料完整度'),
    },
    async ({ analysis }) => {
      try {
        const result = evaluateInvestment(analysis);

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
