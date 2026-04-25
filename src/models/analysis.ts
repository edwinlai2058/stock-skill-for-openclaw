import { z } from 'zod';

// 基本面指標 Schema
export const FundamentalIndicatorSchema = z.object({
  name: z.string(),                          // 指標名稱
  value: z.number().nullable(),              // 數值（null 表示資料不足）
  description: z.string(),                   // 計算說明
  missingFields: z.array(z.string()).optional(), // 缺少的欄位（當 value 為 null 時）
});

// 趨勢資料 Schema
export const TrendDataSchema = z.object({
  qoq: z.number().nullable(),               // 季度變化率 (%)
  yoy: z.number().nullable(),               // 年度變化率 (%)
});

// 資料完整度 Schema
export const DataCompletenessSchema = z.enum(['full', 'partial']);

// 基本面分析 Schema
export const FundamentalAnalysisSchema = z.object({
  ticker: z.string(),
  indicators: z.array(FundamentalIndicatorSchema),
  trends: z.record(z.string(), TrendDataSchema),
  dataCompleteness: DataCompletenessSchema,
});

// 投資建議 Schema
export const RecommendationSchema = z.enum([
  '強力推薦',
  '推薦',
  '中性',
  '不推薦',
  '強力不推薦',
]);

// 評分項目 Schema
export const ScoringItemSchema = z.object({
  category: z.string(),                     // 評分面向
  weight: z.number().min(0).max(1),         // 權重 (0-1)
  score: z.number().min(0).max(100),        // 該面向分數 (0-100)
  reason: z.string(),                       // 評分依據
});

// 評估可信度 Schema
export const DataConfidenceSchema = z.enum(['high', 'low']);

// 分析報告 Schema
export const AnalysisReportSchema = z.object({
  ticker: z.string(),
  score: z.number().min(0).max(100),        // 綜合評分 (0-100)
  recommendation: RecommendationSchema,
  scoringBreakdown: z.array(ScoringItemSchema),
  strengths: z.array(z.string()),           // 優勢
  risks: z.array(z.string()),               // 風險
  dataConfidence: DataConfidenceSchema,
  missingData: z.array(z.string()).optional(), // 缺少的關鍵數據
  disclaimer: z.string(),                   // 免責聲明
});

// 失敗的 Ticker Schema
export const FailedTickerSchema = z.object({
  ticker: z.string(),
  reason: z.string(),
});

// 批次報告 Schema
export const BatchReportSchema = z.object({
  totalRequested: z.number(),
  totalCompleted: z.number(),
  totalFailed: z.number(),
  rankings: z.array(AnalysisReportSchema),       // 依評分排序
  failedTickers: z.array(FailedTickerSchema),
});

// 從 Schema 推導 TypeScript 型別
export type FundamentalIndicator = z.infer<typeof FundamentalIndicatorSchema>;
export type TrendData = z.infer<typeof TrendDataSchema>;
export type FundamentalAnalysis = z.infer<typeof FundamentalAnalysisSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type ScoringItem = z.infer<typeof ScoringItemSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type FailedTicker = z.infer<typeof FailedTickerSchema>;
export type BatchReport = z.infer<typeof BatchReportSchema>;
