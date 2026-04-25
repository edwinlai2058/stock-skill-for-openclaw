import { z } from 'zod';

// 即時報價 Schema
export const StockQuoteSchema = z.object({
  ticker: z.string(),              // 股票代碼
  price: z.number(),               // 現價
  change: z.number(),              // 漲跌
  changePercent: z.number(),       // 漲跌幅 (%)
  volume: z.number(),              // 成交量
  timestamp: z.string(),           // 報價時間
});

// 每日價格 Schema
export const DailyPriceSchema = z.object({
  date: z.string(),                // 日期
  close: z.number(),               // 收盤價
  open: z.number(),                // 開盤價
  high: z.number(),                // 最高價
  low: z.number(),                 // 最低價
  volume: z.number(),              // 成交量
});

// 歷史價格 Schema
export const PriceHistorySchema = z.object({
  ticker: z.string(),              // 股票代碼
  period: z.string(),              // 時間範圍
  prices: z.array(DailyPriceSchema),
});

// 從 Schema 推導 TypeScript 型別
export type StockQuote = z.infer<typeof StockQuoteSchema>;
export type DailyPrice = z.infer<typeof DailyPriceSchema>;
export type PriceHistory = z.infer<typeof PriceHistorySchema>;
