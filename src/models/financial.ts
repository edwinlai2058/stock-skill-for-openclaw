import { z } from 'zod';

// 損益表 Schema
export const IncomeStatementSchema = z.object({
  date: z.string(),                // 報表日期 (YYYY-MM-DD)
  revenue: z.number(),             // 營收
  grossProfit: z.number(),         // 毛利
  operatingIncome: z.number(),     // 營業利益
  netIncome: z.number(),           // 淨利
  eps: z.number(),                 // 每股盈餘
});

// 資產負債表 Schema
export const BalanceSheetSchema = z.object({
  date: z.string(),                // 報表日期 (YYYY-MM-DD)
  totalAssets: z.number(),         // 總資產
  totalLiabilities: z.number(),    // 總負債
  totalEquity: z.number(),         // 股東權益
  totalDebt: z.number(),           // 總債務
  bookValuePerShare: z.number(),   // 每股淨值
});

// 現金流量表 Schema
export const CashFlowStatementSchema = z.object({
  date: z.string(),                // 報表日期 (YYYY-MM-DD)
  operatingCashFlow: z.number(),   // 營業現金流
  capitalExpenditure: z.number(),  // 資本支出
  freeCashFlow: z.number(),        // 自由現金流
});

// 財務報表 Schema
export const FinancialReportSchema = z.object({
  ticker: z.string(),
  incomeStatements: z.array(IncomeStatementSchema),
  balanceSheets: z.array(BalanceSheetSchema),
  cashFlowStatements: z.array(CashFlowStatementSchema),
});

// 從 Schema 推導 TypeScript 型別
export type IncomeStatement = z.infer<typeof IncomeStatementSchema>;
export type BalanceSheet = z.infer<typeof BalanceSheetSchema>;
export type CashFlowStatement = z.infer<typeof CashFlowStatementSchema>;
export type FinancialReport = z.infer<typeof FinancialReportSchema>;
