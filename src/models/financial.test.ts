import { describe, it, expect } from 'vitest';
import {
  IncomeStatementSchema,
  BalanceSheetSchema,
  CashFlowStatementSchema,
  FinancialReportSchema,
} from './financial.js';

describe('IncomeStatementSchema', () => {
  it('parses a valid income statement', () => {
    const data = {
      date: '2024-03-31',
      revenue: 100000,
      grossProfit: 45000,
      operatingIncome: 30000,
      netIncome: 25000,
      eps: 2.5,
    };
    expect(IncomeStatementSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => IncomeStatementSchema.parse({ date: '2024-03-31' })).toThrow();
  });

  it('rejects invalid field types', () => {
    expect(() =>
      IncomeStatementSchema.parse({
        date: '2024-03-31',
        revenue: 'not-a-number',
        grossProfit: 0,
        operatingIncome: 0,
        netIncome: 0,
        eps: 0,
      }),
    ).toThrow();
  });
});

describe('BalanceSheetSchema', () => {
  it('parses a valid balance sheet', () => {
    const data = {
      date: '2024-03-31',
      totalAssets: 500000,
      totalLiabilities: 200000,
      totalEquity: 300000,
      totalDebt: 150000,
      bookValuePerShare: 30.0,
    };
    expect(BalanceSheetSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => BalanceSheetSchema.parse({})).toThrow();
  });
});

describe('CashFlowStatementSchema', () => {
  it('parses a valid cash flow statement', () => {
    const data = {
      date: '2024-03-31',
      operatingCashFlow: 80000,
      capitalExpenditure: 20000,
      freeCashFlow: 60000,
    };
    expect(CashFlowStatementSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => CashFlowStatementSchema.parse({ date: '2024-03-31' })).toThrow();
  });
});

describe('FinancialReportSchema', () => {
  it('parses a valid financial report', () => {
    const data = {
      ticker: 'AAPL',
      incomeStatements: [
        { date: '2024-03-31', revenue: 100000, grossProfit: 45000, operatingIncome: 30000, netIncome: 25000, eps: 2.5 },
      ],
      balanceSheets: [
        { date: '2024-03-31', totalAssets: 500000, totalLiabilities: 200000, totalEquity: 300000, totalDebt: 150000, bookValuePerShare: 30.0 },
      ],
      cashFlowStatements: [
        { date: '2024-03-31', operatingCashFlow: 80000, capitalExpenditure: 20000, freeCashFlow: 60000 },
      ],
    };
    expect(FinancialReportSchema.parse(data)).toEqual(data);
  });

  it('parses a report with empty arrays', () => {
    const data = {
      ticker: 'TSLA',
      incomeStatements: [],
      balanceSheets: [],
      cashFlowStatements: [],
    };
    expect(FinancialReportSchema.parse(data)).toEqual(data);
  });

  it('rejects missing ticker', () => {
    expect(() =>
      FinancialReportSchema.parse({
        incomeStatements: [],
        balanceSheets: [],
        cashFlowStatements: [],
      }),
    ).toThrow();
  });

  it('rejects invalid nested items', () => {
    expect(() =>
      FinancialReportSchema.parse({
        ticker: 'AAPL',
        incomeStatements: [{ date: '2024-03-31' }],
        balanceSheets: [],
        cashFlowStatements: [],
      }),
    ).toThrow();
  });
});
