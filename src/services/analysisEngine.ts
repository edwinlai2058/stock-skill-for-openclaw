import type {
  AnalysisReport,
  BatchReport,
  FailedTicker,
  FinancialReport,
  FundamentalAnalysis,
  FundamentalIndicator,
  Recommendation,
  ScoringItem,
  TrendData,
} from '../models/index.js';
import type { StockQuote } from '../models/price.js';

/**
 * 計算六項基本面指標（EPS、P/E、P/B、ROE、D/E、FCF）。
 * 缺失欄位標註為 null 並列出 missingFields。
 */
export function calculateFundamentals(
  report: FinancialReport,
  quote: StockQuote,
): FundamentalAnalysis {
  const latestIncome = report.incomeStatements[0] ?? null;
  const latestBalance = report.balanceSheets[0] ?? null;
  const latestCashFlow = report.cashFlowStatements[0] ?? null;

  const indicators: FundamentalIndicator[] = [
    calcEPS(latestIncome),
    calcPE(latestIncome, quote),
    calcPB(latestBalance, quote),
    calcROE(latestIncome, latestBalance),
    calcDE(latestBalance),
    calcFCF(latestCashFlow),
  ];

  const hasNull = indicators.some((i) => i.value === null);
  const trends = calculateTrends(report);

  return {
    ticker: report.ticker,
    indicators,
    trends,
    dataCompleteness: hasNull ? 'partial' : 'full',
  };
}

// ── trend helpers ──

/**
 * 計算單一指標的 QoQ 與 YoY 變化率。
 * changeRate = (current - previous) / |previous|
 * 前期值為零時回傳 null。
 */
function calcChangeRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * 從陣列中安全取值。index 0 = 最新一季。
 */
function getMetric(
  arr: Record<string, unknown>[] | undefined,
  index: number,
  field: string,
): number | undefined {
  const item = arr?.[index];
  if (!item) return undefined;
  const val = item[field];
  return typeof val === 'number' ? val : undefined;
}

/**
 * 計算各指標的 QoQ 與 YoY 變化率。
 *
 * - QoQ：index 0 vs index 1（最近兩季）
 * - YoY：index 0 vs index 3（最近一季 vs 四季前，即去年同季）
 * - 前期值為零時回傳 null
 */
export function calculateTrends(
  report: FinancialReport,
): Record<string, TrendData> {
  const trends: Record<string, TrendData> = {};

  const incomeMetrics = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps'] as const;
  const balanceMetrics = ['totalAssets', 'totalEquity', 'totalDebt'] as const;
  const cashFlowMetrics = ['operatingCashFlow', 'freeCashFlow'] as const;

  const metricSources: Array<{
    metrics: readonly string[];
    data: Record<string, unknown>[] | undefined;
  }> = [
    { metrics: incomeMetrics, data: report.incomeStatements as unknown as Record<string, unknown>[] },
    { metrics: balanceMetrics, data: report.balanceSheets as unknown as Record<string, unknown>[] },
    { metrics: cashFlowMetrics, data: report.cashFlowStatements as unknown as Record<string, unknown>[] },
  ];

  for (const { metrics, data } of metricSources) {
    for (const field of metrics) {
      const current = getMetric(data, 0, field);
      if (current === undefined) continue;

      const prev = getMetric(data, 1, field);
      const yearAgo = getMetric(data, 3, field);

      const qoq = prev !== undefined ? calcChangeRate(current, prev) : null;
      const yoy = yearAgo !== undefined ? calcChangeRate(current, yearAgo) : null;

      // Only add if at least one trend can be computed (or attempted)
      if (prev !== undefined || yearAgo !== undefined) {
        trends[field] = { qoq, yoy };
      }
    }
  }

  return trends;
}

// ── helper types for nullable latest statements ──

type LatestIncome = FinancialReport['incomeStatements'][number] | null;
type LatestBalance = FinancialReport['balanceSheets'][number] | null;
type LatestCashFlow = FinancialReport['cashFlowStatements'][number] | null;

// ── individual indicator calculators ──

function calcEPS(income: LatestIncome): FundamentalIndicator {
  if (!income) {
    return {
      name: 'EPS',
      value: null,
      description: '每股盈餘（Earnings Per Share）',
      missingFields: ['incomeStatements'],
    };
  }
  return {
    name: 'EPS',
    value: income.eps,
    description: '每股盈餘（Earnings Per Share）',
  };
}

function calcPE(income: LatestIncome, quote: StockQuote): FundamentalIndicator {
  if (!income) {
    return {
      name: 'P/E',
      value: null,
      description: '本益比（Price-to-Earnings Ratio）= 股價 / EPS',
      missingFields: ['incomeStatements'],
    };
  }
  if (income.eps === 0) {
    return {
      name: 'P/E',
      value: null,
      description: '本益比（Price-to-Earnings Ratio）= 股價 / EPS',
      missingFields: ['eps (為零，無法計算)'],
    };
  }
  return {
    name: 'P/E',
    value: quote.price / income.eps,
    description: '本益比（Price-to-Earnings Ratio）= 股價 / EPS',
  };
}

function calcPB(balance: LatestBalance, quote: StockQuote): FundamentalIndicator {
  if (!balance) {
    return {
      name: 'P/B',
      value: null,
      description: '股價淨值比（Price-to-Book Ratio）= 股價 / 每股淨值',
      missingFields: ['balanceSheets'],
    };
  }
  if (balance.bookValuePerShare === 0) {
    return {
      name: 'P/B',
      value: null,
      description: '股價淨值比（Price-to-Book Ratio）= 股價 / 每股淨值',
      missingFields: ['bookValuePerShare (為零，無法計算)'],
    };
  }
  return {
    name: 'P/B',
    value: quote.price / balance.bookValuePerShare,
    description: '股價淨值比（Price-to-Book Ratio）= 股價 / 每股淨值',
  };
}

function calcROE(income: LatestIncome, balance: LatestBalance): FundamentalIndicator {
  const missing: string[] = [];
  if (!income) missing.push('incomeStatements');
  if (!balance) missing.push('balanceSheets');
  if (missing.length > 0) {
    return {
      name: 'ROE',
      value: null,
      description: '股東權益報酬率（Return on Equity）= 淨利 / 股東權益',
      missingFields: missing,
    };
  }
  if (balance!.totalEquity === 0) {
    return {
      name: 'ROE',
      value: null,
      description: '股東權益報酬率（Return on Equity）= 淨利 / 股東權益',
      missingFields: ['totalEquity (為零，無法計算)'],
    };
  }
  return {
    name: 'ROE',
    value: income!.netIncome / balance!.totalEquity,
    description: '股東權益報酬率（Return on Equity）= 淨利 / 股東權益',
  };
}

function calcDE(balance: LatestBalance): FundamentalIndicator {
  if (!balance) {
    return {
      name: 'D/E',
      value: null,
      description: '負債權益比（Debt-to-Equity Ratio）= 總債務 / 股東權益',
      missingFields: ['balanceSheets'],
    };
  }
  if (balance.totalEquity === 0) {
    return {
      name: 'D/E',
      value: null,
      description: '負債權益比（Debt-to-Equity Ratio）= 總債務 / 股東權益',
      missingFields: ['totalEquity (為零，無法計算)'],
    };
  }
  return {
    name: 'D/E',
    value: balance.totalDebt / balance.totalEquity,
    description: '負債權益比（Debt-to-Equity Ratio）= 總債務 / 股東權益',
  };
}

function calcFCF(cashFlow: LatestCashFlow): FundamentalIndicator {
  if (!cashFlow) {
    return {
      name: 'FCF',
      value: null,
      description: '自由現金流（Free Cash Flow）= 營業現金流 - 資本支出',
      missingFields: ['cashFlowStatements'],
    };
  }
  return {
    name: 'FCF',
    value: cashFlow.operatingCashFlow - cashFlow.capitalExpenditure,
    description: '自由現金流（Free Cash Flow）= 營業現金流 - 資本支出',
  };
}

// ── evaluateInvestment ──

const DISCLAIMER = '本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。';

/** 從 indicators 陣列中取得指定名稱的指標值 */
function getIndicatorValue(indicators: FundamentalIndicator[], name: string): number | null {
  const ind = indicators.find((i) => i.name === name);
  return ind?.value ?? null;
}

/** 獲利能力評分 (EPS + ROE) */
function scoreProfitability(indicators: FundamentalIndicator[]): { score: number; reason: string } {
  const eps = getIndicatorValue(indicators, 'EPS');
  const roe = getIndicatorValue(indicators, 'ROE');

  if (eps === null && roe === null) return { score: 50, reason: 'EPS 與 ROE 資料不足，給予中性分數' };

  let score = 0;
  let count = 0;
  const parts: string[] = [];

  if (eps !== null) {
    // EPS > 5 → 100, EPS = 0 → 30, EPS < 0 → 0, linear between
    const epsScore = eps < 0 ? 0 : Math.min(100, 30 + (eps / 5) * 70);
    score += epsScore;
    count++;
    parts.push(`EPS=${eps.toFixed(2)}`);
  }

  if (roe !== null) {
    // ROE > 0.20 → 100, ROE = 0 → 30, ROE < 0 → 0, linear between
    const roeScore = roe < 0 ? 0 : Math.min(100, 30 + (roe / 0.20) * 70);
    score += roeScore;
    count++;
    parts.push(`ROE=${(roe * 100).toFixed(1)}%`);
  }

  return { score: score / count, reason: `獲利能力：${parts.join('、')}` };
}

/** 估值合理性評分 (P/E + P/B) */
function scoreValuation(indicators: FundamentalIndicator[]): { score: number; reason: string } {
  const pe = getIndicatorValue(indicators, 'P/E');
  const pb = getIndicatorValue(indicators, 'P/B');

  if (pe === null && pb === null) return { score: 50, reason: 'P/E 與 P/B 資料不足，給予中性分數' };

  let score = 0;
  let count = 0;
  const parts: string[] = [];

  if (pe !== null) {
    // Lower P/E is better: P/E <= 10 → 100, P/E = 25 → 50, P/E >= 40 → 0
    const peScore = pe <= 0 ? 50 : Math.max(0, Math.min(100, 100 - ((pe - 10) / 30) * 100));
    score += peScore;
    count++;
    parts.push(`P/E=${pe.toFixed(1)}`);
  }

  if (pb !== null) {
    // Lower P/B is better: P/B <= 1 → 100, P/B = 3 → 50, P/B >= 5 → 0
    const pbScore = pb <= 0 ? 50 : Math.max(0, Math.min(100, 100 - ((pb - 1) / 4) * 100));
    score += pbScore;
    count++;
    parts.push(`P/B=${pb.toFixed(1)}`);
  }

  return { score: score / count, reason: `估值合理性：${parts.join('、')}` };
}

/** 財務健全度評分 (D/E) */
function scoreFinancialHealth(indicators: FundamentalIndicator[]): { score: number; reason: string } {
  const de = getIndicatorValue(indicators, 'D/E');

  if (de === null) return { score: 50, reason: 'D/E 資料不足，給予中性分數' };

  // Lower D/E is better: D/E <= 0.3 → 100, D/E = 1 → 50, D/E >= 2 → 0
  const deScore = de < 0 ? 50 : Math.max(0, Math.min(100, 100 - ((de - 0.3) / 1.7) * 100));
  return { score: deScore, reason: `財務健全度：D/E=${de.toFixed(2)}` };
}

/** 現金流品質評分 (FCF) */
function scoreCashFlowQuality(indicators: FundamentalIndicator[]): { score: number; reason: string } {
  const fcf = getIndicatorValue(indicators, 'FCF');

  if (fcf === null) return { score: 50, reason: 'FCF 資料不足，給予中性分數' };

  // FCF > 0 is good. Scale: FCF >= 50000 → 100, FCF = 0 → 40, FCF < 0 → 10
  let fcfScore: number;
  if (fcf < 0) {
    fcfScore = Math.max(0, 10 + (fcf / 50_000) * 10);
  } else {
    fcfScore = Math.min(100, 40 + (fcf / 50_000) * 60);
  }
  return { score: fcfScore, reason: `現金流品質：FCF=${fcf.toFixed(0)}` };
}

/** 成長趨勢評分 (based on trends) */
function scoreGrowthTrend(trends: Record<string, TrendData>): { score: number; reason: string } {
  const trendKeys = Object.keys(trends);
  if (trendKeys.length === 0) return { score: 50, reason: '趨勢資料不足，給予中性分數' };

  // Average positive trend rates across all available metrics
  let totalScore = 0;
  let count = 0;

  for (const key of trendKeys) {
    const t = trends[key];
    if (t.qoq !== null) {
      // QoQ growth > 0.1 (10%) → 100, 0 → 50, < -0.1 → 0
      totalScore += Math.max(0, Math.min(100, 50 + t.qoq * 500));
      count++;
    }
    if (t.yoy !== null) {
      totalScore += Math.max(0, Math.min(100, 50 + t.yoy * 250));
      count++;
    }
  }

  if (count === 0) return { score: 50, reason: '趨勢資料不足，給予中性分數' };

  const score = totalScore / count;
  return { score, reason: `成長趨勢：基於 ${count} 項趨勢指標計算` };
}

/** 根據分數決定投資建議 */
function mapRecommendation(score: number): Recommendation {
  if (score >= 80) return '強力推薦';
  if (score >= 65) return '推薦';
  if (score >= 50) return '中性';
  if (score >= 35) return '不推薦';
  return '強力不推薦';
}

/** 根據指標值產生優勢列表 */
function generateStrengths(indicators: FundamentalIndicator[], trends: Record<string, TrendData>): string[] {
  const strengths: string[] = [];
  const eps = getIndicatorValue(indicators, 'EPS');
  const roe = getIndicatorValue(indicators, 'ROE');
  const pe = getIndicatorValue(indicators, 'P/E');
  const pb = getIndicatorValue(indicators, 'P/B');
  const de = getIndicatorValue(indicators, 'D/E');
  const fcf = getIndicatorValue(indicators, 'FCF');

  if (eps !== null && eps > 3) strengths.push(`每股盈餘表現良好（EPS=${eps.toFixed(2)}）`);
  if (roe !== null && roe > 0.15) strengths.push(`股東權益報酬率優異（ROE=${(roe * 100).toFixed(1)}%）`);
  if (pe !== null && pe > 0 && pe < 20) strengths.push(`估值合理（P/E=${pe.toFixed(1)}）`);
  if (pb !== null && pb > 0 && pb < 2) strengths.push(`股價淨值比偏低（P/B=${pb.toFixed(1)}）`);
  if (de !== null && de >= 0 && de < 0.5) strengths.push(`負債比率低，財務穩健（D/E=${de.toFixed(2)}）`);
  if (fcf !== null && fcf > 0) strengths.push(`自由現金流為正（FCF=${fcf.toFixed(0)}）`);

  // Check growth trends
  const revTrend = trends['revenue'];
  if (revTrend?.yoy !== null && revTrend?.yoy !== undefined && revTrend.yoy > 0.05) {
    strengths.push(`營收年增率正成長（YoY=${(revTrend.yoy * 100).toFixed(1)}%）`);
  }

  return strengths;
}

/** 根據指標值產生風險列表 */
function generateRisks(indicators: FundamentalIndicator[], trends: Record<string, TrendData>): string[] {
  const risks: string[] = [];
  const eps = getIndicatorValue(indicators, 'EPS');
  const roe = getIndicatorValue(indicators, 'ROE');
  const pe = getIndicatorValue(indicators, 'P/E');
  const pb = getIndicatorValue(indicators, 'P/B');
  const de = getIndicatorValue(indicators, 'D/E');
  const fcf = getIndicatorValue(indicators, 'FCF');

  if (eps !== null && eps < 0) risks.push(`每股盈餘為負（EPS=${eps.toFixed(2)}）`);
  if (roe !== null && roe < 0) risks.push(`股東權益報酬率為負（ROE=${(roe * 100).toFixed(1)}%）`);
  if (pe !== null && pe > 30) risks.push(`估值偏高（P/E=${pe.toFixed(1)}）`);
  if (pb !== null && pb > 4) risks.push(`股價淨值比偏高（P/B=${pb.toFixed(1)}）`);
  if (de !== null && de > 1.5) risks.push(`負債比率偏高（D/E=${de.toFixed(2)}）`);
  if (fcf !== null && fcf < 0) risks.push(`自由現金流為負（FCF=${fcf.toFixed(0)}）`);

  // Check declining trends
  const revTrend = trends['revenue'];
  if (revTrend?.yoy !== null && revTrend?.yoy !== undefined && revTrend.yoy < -0.05) {
    risks.push(`營收年增率衰退（YoY=${(revTrend.yoy * 100).toFixed(1)}%）`);
  }

  // Check for missing data
  const nullIndicators = indicators.filter((i) => i.value === null);
  if (nullIndicators.length > 0) {
    risks.push(`部分指標資料不足（${nullIndicators.map((i) => i.name).join('、')}）`);
  }

  return risks;
}

/**
 * 根據基本面分析結果產出投資評估報告。
 * 純函式：不依賴外部狀態，僅根據輸入計算結果。
 */
export function evaluateInvestment(analysis: FundamentalAnalysis): AnalysisReport {
  const { indicators, trends, dataCompleteness } = analysis;

  // Calculate category scores
  const profitability = scoreProfitability(indicators);
  const valuation = scoreValuation(indicators);
  const financialHealth = scoreFinancialHealth(indicators);
  const cashFlow = scoreCashFlowQuality(indicators);
  const growth = scoreGrowthTrend(trends);

  const scoringBreakdown: ScoringItem[] = [
    { category: '獲利能力', weight: 0.25, score: Math.round(profitability.score), reason: profitability.reason },
    { category: '估值合理性', weight: 0.25, score: Math.round(valuation.score), reason: valuation.reason },
    { category: '財務健全度', weight: 0.20, score: Math.round(financialHealth.score), reason: financialHealth.reason },
    { category: '現金流品質', weight: 0.15, score: Math.round(cashFlow.score), reason: cashFlow.reason },
    { category: '成長趨勢', weight: 0.15, score: Math.round(growth.score), reason: growth.reason },
  ];

  // Weighted sum
  const score = Math.round(
    scoringBreakdown.reduce((sum, item) => sum + item.score * item.weight, 0),
  );

  const recommendation = mapRecommendation(score);
  const strengths = generateStrengths(indicators, trends);
  const risks = generateRisks(indicators, trends);

  // Data confidence
  const dataConfidence = dataCompleteness === 'full' ? 'high' : 'low';
  const missingData =
    dataCompleteness === 'partial'
      ? indicators
          .filter((i) => i.value === null)
          .flatMap((i) => i.missingFields ?? [i.name])
      : undefined;

  return {
    ticker: analysis.ticker,
    score,
    recommendation,
    scoringBreakdown,
    strengths,
    risks,
    dataConfidence,
    ...(missingData && missingData.length > 0 ? { missingData } : {}),
    disclaimer: DISCLAIMER,
  };
}

// ── generateBatchSummary ──

/**
 * 彙整多份 AnalysisReport 與 FailedTicker，產出 BatchReport。
 * rankings 依 score 降序排列。
 */
export function generateBatchSummary(
  reports: AnalysisReport[],
  failedTickers: FailedTicker[],
): BatchReport {
  const rankings = [...reports].sort((a, b) => b.score - a.score);

  return {
    totalRequested: reports.length + failedTickers.length,
    totalCompleted: reports.length,
    totalFailed: failedTickers.length,
    rankings,
    failedTickers,
  };
}
