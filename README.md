# OpenClaw Stock Analysis Skill

An MCP (Model Context Protocol) server that provides comprehensive US stock fundamental analysis capabilities to AI assistants.

## Overview

OpenClaw Stock Analysis Skill exposes six integrated tools that enable AI agents to perform deep fundamental analysis on US stocks. The skill retrieves financial data from the Financial Modeling Prep (FMP) API and computes key investment metrics with trend analysis.

## Features

- **Financial Data Retrieval** — Fetch quarterly income statements, balance sheets, and cash flow statements
- **Real-time Quotes** — Get current stock prices, changes, and trading volume
- **Historical Price Data** — Access daily OHLCV (Open, High, Low, Close, Volume) data for custom periods
- **Fundamental Analysis** — Calculate six key indicators (EPS, P/E, P/B, ROE, D/E, FCF) with QoQ/YoY trends
- **Investment Evaluation** — Generate scored investment reports (0–100) with recommendation tiers
- **Batch Analysis** — Analyze up to 20 tickers simultaneously and rank them by investment potential

## Tools

| Tool | Purpose |
|------|---------|
| `fetch_financial_report` | Retrieve quarterly financial statements |
| `fetch_stock_quote` | Get real-time stock price and volume data |
| `fetch_price_history` | Fetch historical daily OHLCV data |
| `analyze_fundamentals` | Compute key financial indicators with trends |
| `evaluate_investment` | Generate scored investment recommendation |
| `batch_analyze` | Run full analysis pipeline for multiple tickers |

## Tech Stack

- **Runtime** — Node.js with TypeScript (strict mode)
- **Module System** — ES Modules (ES2022)
- **Validation** — Zod v4 for schema validation and type inference
- **MCP Framework** — @modelcontextprotocol/sdk with stdio transport
- **HTTP Client** — node-fetch
- **Testing** — Vitest v4 with fast-check for property-based testing
- **Mocking** — MSW v2 for HTTP request mocking

## Installation

### Prerequisites

- Node.js 18+ with npm
- FMP API key (get one at [financialmodelingprep.com](https://financialmodelingprep.com))

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd openclaw-stock-analysis

# Install dependencies
npm install

# Set environment variable
export FMP_API_KEY=your_api_key_here
```

## Usage

### Start the MCP Server

```bash
npm start
```

The server will start on stdio transport and be ready to receive tool calls from MCP clients.

### Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/` directory.

## Project Structure

```
src/
├── index.ts                    # Entry point — MCP server setup and tool registration
├── models/                     # Zod schemas and TypeScript types
│   ├── financial.ts           # Financial statement models
│   ├── price.ts               # Stock quote and price history models
│   ├── analysis.ts            # Analysis and evaluation models
│   └── index.ts               # Barrel exports
├── services/                   # Business logic and data fetching
│   ├── dataFetcher.ts         # HTTP client with retry logic
│   ├── analysisEngine.ts      # Calculation and analysis functions
│   └── index.ts               # Barrel exports
├── tools/                      # MCP tool implementations
│   ├── fetchFinancialReport.ts
│   ├── fetchStockQuote.ts
│   ├── fetchPriceHistory.ts
│   ├── analyzeFundamentals.ts
│   ├── evaluateInvestment.ts
│   ├── batchAnalyze.ts
│   └── index.ts               # Barrel exports
├── errors/                     # Custom error classes
│   └── index.ts
└── __tests__/                  # Test suites
    ├── integration/           # Server-level integration tests
    └── pbt/                   # Property-based tests
```

## Architecture

### Tool Registration Pattern

Each tool is registered via a `register<ToolName>(server: McpServer): void` function that:
1. Defines the tool with snake_case name and Traditional Chinese description
2. Specifies input parameters using Zod schema
3. Implements async handler that calls service layer functions
4. Returns structured MCP-formatted responses

### Error Handling

The skill implements consistent error handling with structured JSON responses:

- `TickerNotFoundError` — Invalid or unsupported ticker symbol
- `DataSourceUnavailableError` — FMP API unavailable (includes retry-after)
- `ValidationError` — Invalid input parameters
- Unknown errors — Generic error response with message

### Data Flow

```
MCP Client
    ↓
Tool Handler (tools/*.ts)
    ↓
Service Layer (services/*.ts)
    ↓
DataFetcher (HTTP + retry logic)
    ↓
FMP API
```

## Configuration

### Environment Variables

- `FMP_API_KEY` — Financial Modeling Prep API key (required)

### TypeScript Configuration

- Module resolution: `bundler`
- Target: ES2022
- Strict mode enabled
- Source maps enabled
- Declaration files generated

## Testing

The project includes three types of tests:

- **Unit Tests** — Co-located with source files (`*.test.ts`)
- **Integration Tests** — Server-level tests in `src/__tests__/integration/`
- **Property-Based Tests** — Using fast-check in `src/__tests__/pbt/`

Run tests with:

```bash
npm test              # Single run
npm run test:watch   # Watch mode
```

## Disclaimer

本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。

*This analysis report is for reference only and does not constitute any investment advice. Investors should make their own judgments and bear investment risks.*

## License

See LICENSE file for details.

## Support

For issues, questions, or contributions, please open an issue or submit a pull request.
