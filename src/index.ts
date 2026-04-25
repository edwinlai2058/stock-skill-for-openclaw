import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerFetchFinancialReport,
  registerFetchStockQuote,
  registerFetchPriceHistory,
  registerAnalyzeFundamentals,
  registerEvaluateInvestment,
  registerBatchAnalyze,
} from './tools/index.js';

const server = new McpServer({
  name: 'openclaw-stock-analysis',
  version: '1.0.0',
});

registerFetchFinancialReport(server);
registerFetchStockQuote(server);
registerFetchPriceHistory(server);
registerAnalyzeFundamentals(server);
registerEvaluateInvestment(server);
registerBatchAnalyze(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP Server 啟動失敗：', error);
  process.exit(1);
});
