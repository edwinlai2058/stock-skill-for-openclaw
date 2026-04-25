import { describe, it, expect } from 'vitest';
import { calculateFundamentals, calculateTrends } from './analysisEngine.js';
import type { FinancialReport } from '../models/financial.js';
import type { StockQuote } from '../models/price.js';

function makeQuote(overrides: Partial<StockQuote> = {}): StockQuote {
  return {
    ticker: 'AAPL',
    price: 150,
    change: 2,
    changePercent: 1.35,
    volume: 1_000_000,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeReport(overrides: Partial<FinancialReport> = {}): FinancialReport {
  return {
    ticker: 'AAPL',
    incomeStatements: [
      {
        date: '2024-03-31',
        revenue: 100_000,
        grossProfit: 40_000,
        operatingIncome: 30_000,
        netIncome: 25_000,
        eps: 5,
      },
    ],
    balanceSheets: [
      {
        date: '2024-03-31',
        totalAssets: 500_000,
        totalLiabilities: 200_000,
        totalEquity: 300_000,
        totalDebt: 100_000,
        bookValuePerShare: 30,
      },
    ],
    cashFlowStatements: [
      {
        date: '2024-03-31',
        operatingCashFlow: 35_000,
        capitalExpenditure: 10_000,
        freeCashFlow: 25_000,
      },
    ],
    ...overrides,
  };
}

describe('calculateFundamentals', () => {
  it('calculates all six indicators correctly with complete data', () => {
    const report = makeReport();
    const quote = makeQuote();
    const result = calculateFundamentals(report, quote);

    expect(result.ticker).toBe('AAPL');
    expect(result.dataCompleteness).toBe('full');
    expect(result.trends).toEqual({});
    expect(result.indicators).toHaveLength(6);

    const byName = Object.fromEntries(result.indicators.map((i) => [i.name, i]));

    // EPS = eps field directly
    expect(byName['EPS'].value).toBe(5);

    // P/E = price / EPS = 150 / 5 = 30
    expect(byName['P/E'].value).toBe(30);

    // P/B = price / bookValuePerShare = 150 / 30 = 5
    expect(byName['P/B'].value).toBe(5);

    // ROE = netIncome / totalEquity = 25000 / 300000
    expect(byName['ROE'].value).toBeCloseTo(25_000 / 300_000);

    // D/E = totalDebt / totalEquity = 100000 / 300000
    expect(byName['D/E'].value).toBeCloseTo(100_000 / 300_000);

    // FCF = operatingCashFlow - capitalExpenditure = 35000 - 10000 = 25000
    expect(byName['FCF'].value).toBe(25_000);
  });

  it('returns null P/E when EPS is zero', () => {
    const report = makeReport({
      incomeStatements: [
        { date: '2024-03-31', revenue: 100_000, grossProfit: 40_000, operatingIncome: 0, netIncome: 0, eps: 0 },
      ],
    });
    const result = calculateFundamentals(report, makeQuote());
    const pe = result.indicators.find((i) => i.name === 'P/E')!;

    expect(pe.value).toBeNull();
    expect(pe.missingFields).toBeDefined();
    expect(result.dataCompleteness).toBe('partial');
  });

  it('returns null P/B when bookValuePerShare is zero', () => {
    const report = makeReport({
      balanceSheets: [
        { date: '2024-03-31', totalAssets: 500_000, totalLiabilities: 200_000, totalEquity: 300_000, totalDebt: 100_000, bookValuePerShare: 0 },
      ],
    });
    const result = calculateFundamentals(report, makeQuote());
    const pb = result.indicators.find((i) => i.name === 'P/B')!;

    expect(pb.value).toBeNull();
    expect(pb.missingFields).toBeDefined();
  });

  it('returns null ROE and D/E when totalEquity is zero', () => {
    const report = makeReport({
      balanceSheets: [
        { date: '2024-03-31', totalAssets: 500_000, totalLiabilities: 500_000, totalEquity: 0, totalDebt: 200_000, bookValuePerShare: 0 },
      ],
    });
    const result = calculateFundamentals(report, makeQuote());
    const roe = result.indicators.find((i) => i.name === 'ROE')!;
    const de = result.indicators.find((i) => i.name === 'D/E')!;

    expect(roe.value).toBeNull();
    expect(de.value).toBeNull();
  });

  it('handles empty income statements', () => {
    const report = makeReport({ incomeStatements: [] });
    const result = calculateFundamentals(report, makeQuote());
    const eps = result.indicators.find((i) => i.name === 'EPS')!;
    const pe = result.indicators.find((i) => i.name === 'P/E')!;

    expect(eps.value).toBeNull();
    expect(eps.missingFields).toContain('incomeStatements');
    expect(pe.value).toBeNull();
    expect(pe.missingFields).toContain('incomeStatements');
    expect(result.dataCompleteness).toBe('partial');
  });

  it('handles empty balance sheets', () => {
    const report = makeReport({ balanceSheets: [] });
    const result = calculateFundamentals(report, makeQuote());
    const pb = result.indicators.find((i) => i.name === 'P/B')!;
    const roe = result.indicators.find((i) => i.name === 'ROE')!;
    const de = result.indicators.find((i) => i.name === 'D/E')!;

    expect(pb.value).toBeNull();
    expect(roe.value).toBeNull();
    expect(de.value).toBeNull();
  });

  it('handles empty cash flow statements', () => {
    const report = makeReport({ cashFlowStatements: [] });
    const result = calculateFundamentals(report, makeQuote());
    const fcf = result.indicators.find((i) => i.name === 'FCF')!;

    expect(fcf.value).toBeNull();
    expect(fcf.missingFields).toContain('cashFlowStatements');
  });

  it('handles completely empty report — all indicators null, partial', () => {
    const report = makeReport({
      incomeStatements: [],
      balanceSheets: [],
      cashFlowStatements: [],
    });
    const result = calculateFundamentals(report, makeQuote());

    expect(result.dataCompleteness).toBe('partial');
    result.indicators.forEach((ind) => {
      expect(ind.value).toBeNull();
      expect(ind.missingFields).toBeDefined();
      expect(ind.missingFields!.length).toBeGreaterThan(0);
    });
  });
});

// ── helpers for trend tests ──

function makeMultiQuarterReport(overrides: Partial<FinancialReport> = {}): FinancialReport {
  return {
    ticker: 'AAPL',
    incomeStatements: [
      { date: '2024-03-31', revenue: 120_000, grossProfit: 50_000, operatingIncome: 40_000, netIncome: 30_000, eps: 6 },
      { date: '2023-12-31', revenue: 100_000, grossProfit: 40_000, operatingIncome: 30_000, netIncome: 25_000, eps: 5 },
      { date: '2023-09-30', revenue: 95_000, grossProfit: 38_000, operatingIncome: 28_000, netIncome: 22_000, eps: 4.4 },
      { date: '2023-06-30', revenue: 90_000, grossProfit: 36_000, operatingIncome: 26_000, netIncome: 20_000, eps: 4 },
    ],
    balanceSheets: [
      { date: '2024-03-31', totalAssets: 600_000, totalLiabilities: 250_000, totalEquity: 350_000, totalDebt: 120_000, bookValuePerShare: 35 },
      { date: '2023-12-31', totalAssets: 500_000, totalLiabilities: 200_000, totalEquity: 300_000, totalDebt: 100_000, bookValuePerShare: 30 },
      { date: '2023-09-30', totalAssets: 480_000, totalLiabilities: 190_000, totalEquity: 290_000, totalDebt: 95_000, bookValuePerShare: 29 },
      { date: '2023-06-30', totalAssets: 450_000, totalLiabilities: 180_000, totalEquity: 270_000, totalDebt: 90_000, bookValuePerShare: 27 },
    ],
    cashFlowStatements: [
      { date: '2024-03-31', operatingCashFlow: 45_000, capitalExpenditure: 12_000, freeCashFlow: 33_000 },
      { date: '2023-12-31', operatingCashFlow: 35_000, capitalExpenditure: 10_000, freeCashFlow: 25_000 },
      { date: '2023-09-30', operatingCashFlow: 32_000, capitalExpenditure: 9_000, freeCashFlow: 23_000 },
      { date: '2023-06-30', operatingCashFlow: 30_000, capitalExpenditure: 8_000, freeCashFlow: 22_000 },
    ],
    ...overrides,
  };
}

describe('calculateTrends', () => {
  it('calculates QoQ and YoY correctly for income statement metrics', () => {
    const report = makeMultiQuarterReport();
    const trends = calculateTrends(report);

    // revenue QoQ = (120000 - 100000) / |100000| = 0.2
    expect(trends['revenue'].qoq).toBeCloseTo(0.2);
    // revenue YoY = (120000 - 90000) / |90000| ≈ 0.3333
    expect(trends['revenue'].yoy).toBeCloseTo(120_000 / 90_000 - 1);

    // eps QoQ = (6 - 5) / |5| = 0.2
    expect(trends['eps'].qoq).toBeCloseTo(0.2);
    // eps YoY = (6 - 4) / |4| = 0.5
    expect(trends['eps'].yoy).toBeCloseTo(0.5);
  });

  it('calculates QoQ and YoY correctly for balance sheet metrics', () => {
    const report = makeMultiQuarterReport();
    const trends = calculateTrends(report);

    // totalAssets QoQ = (600000 - 500000) / |500000| = 0.2
    expect(trends['totalAssets'].qoq).toBeCloseTo(0.2);
    // totalAssets YoY = (600000 - 450000) / |450000| ≈ 0.3333
    expect(trends['totalAssets'].yoy).toBeCloseTo((600_000 - 450_000) / 450_000);

    // totalDebt QoQ = (120000 - 100000) / |100000| = 0.2
    expect(trends['totalDebt'].qoq).toBeCloseTo(0.2);
  });

  it('calculates QoQ and YoY correctly for cash flow metrics', () => {
    const report = makeMultiQuarterReport();
    const trends = calculateTrends(report);

    // operatingCashFlow QoQ = (45000 - 35000) / |35000| ≈ 0.2857
    expect(trends['operatingCashFlow'].qoq).toBeCloseTo((45_000 - 35_000) / 35_000);
    // freeCashFlow YoY = (33000 - 22000) / |22000| = 0.5
    expect(trends['freeCashFlow'].yoy).toBeCloseTo((33_000 - 22_000) / 22_000);
  });

  it('returns null QoQ/YoY when previous value is zero', () => {
    const report = makeMultiQuarterReport({
      incomeStatements: [
        { date: '2024-03-31', revenue: 100_000, grossProfit: 40_000, operatingIncome: 30_000, netIncome: 25_000, eps: 5 },
        { date: '2023-12-31', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
        { date: '2023-09-30', revenue: 80_000, grossProfit: 32_000, operatingIncome: 24_000, netIncome: 18_000, eps: 3.6 },
        { date: '2023-06-30', revenue: 0, grossProfit: 0, operatingIncome: 0, netIncome: 0, eps: 0 },
      ],
    });
    const trends = calculateTrends(report);

    // QoQ: previous (index 1) revenue is 0 → null
    expect(trends['revenue'].qoq).toBeNull();
    // YoY: yearAgo (index 3) revenue is 0 → null
    expect(trends['revenue'].yoy).toBeNull();
    expect(trends['eps'].qoq).toBeNull();
    expect(trends['eps'].yoy).toBeNull();
  });

  it('returns empty trends when only one quarter is available', () => {
    const report = makeReport(); // single quarter from existing helper
    const trends = calculateTrends(report);

    expect(trends).toEqual({});
  });

  it('returns QoQ only (yoy null) when only two quarters available', () => {
    const report = makeMultiQuarterReport({
      incomeStatements: [
        { date: '2024-03-31', revenue: 120_000, grossProfit: 50_000, operatingIncome: 40_000, netIncome: 30_000, eps: 6 },
        { date: '2023-12-31', revenue: 100_000, grossProfit: 40_000, operatingIncome: 30_000, netIncome: 25_000, eps: 5 },
      ],
      balanceSheets: [
        { date: '2024-03-31', totalAssets: 600_000, totalLiabilities: 250_000, totalEquity: 350_000, totalDebt: 120_000, bookValuePerShare: 35 },
        { date: '2023-12-31', totalAssets: 500_000, totalLiabilities: 200_000, totalEquity: 300_000, totalDebt: 100_000, bookValuePerShare: 30 },
      ],
      cashFlowStatements: [
        { date: '2024-03-31', operatingCashFlow: 45_000, capitalExpenditure: 12_000, freeCashFlow: 33_000 },
        { date: '2023-12-31', operatingCashFlow: 35_000, capitalExpenditure: 10_000, freeCashFlow: 25_000 },
      ],
    });
    const trends = calculateTrends(report);

    expect(trends['revenue'].qoq).toBeCloseTo(0.2);
    expect(trends['revenue'].yoy).toBeNull();
    expect(trends['totalAssets'].qoq).toBeCloseTo(0.2);
    expect(trends['totalAssets'].yoy).toBeNull();
  });

  it('handles negative values correctly', () => {
    const report = makeMultiQuarterReport({
      incomeStatements: [
        { date: '2024-03-31', revenue: 100_000, grossProfit: 40_000, operatingIncome: -10_000, netIncome: -5_000, eps: -1 },
        { date: '2023-12-31', revenue: 90_000, grossProfit: 36_000, operatingIncome: -20_000, netIncome: -10_000, eps: -2 },
        { date: '2023-09-30', revenue: 85_000, grossProfit: 34_000, operatingIncome: -15_000, netIncome: -8_000, eps: -1.6 },
        { date: '2023-06-30', revenue: 80_000, grossProfit: 32_000, operatingIncome: -25_000, netIncome: -15_000, eps: -3 },
      ],
    });
    const trends = calculateTrends(report);

    // operatingIncome QoQ = (-10000 - (-20000)) / |-20000| = 10000/20000 = 0.5
    expect(trends['operatingIncome'].qoq).toBeCloseTo(0.5);
    // eps YoY = (-1 - (-3)) / |-3| = 2/3 ≈ 0.6667
    expect(trends['eps'].yoy).toBeCloseTo(2 / 3);
  });

  it('calculateFundamentals populates trends field with multi-quarter data', () => {
    const report = makeMultiQuarterReport();
    const quote = makeQuote();
    const result = calculateFundamentals(report, quote);

    // Should have trend entries for all tracked metrics
    expect(Object.keys(result.trends).length).toBeGreaterThan(0);
    expect(result.trends['revenue']).toBeDefined();
    expect(result.trends['revenue'].qoq).toBeCloseTo(0.2);
    expect(result.trends['totalAssets']).toBeDefined();
    expect(result.trends['operatingCashFlow']).toBeDefined();
  });
});

import { evaluateInvestment } from './analysisEngine.js';
import type { FundamentalAnalysis } from '../models/analysis.js';

// ── helpers for evaluateInvestment tests ──

function makeFullAnalysis(overrides: Partial<FundamentalAnalysis> = {}): FundamentalAnalysis {
  return {
    ticker: 'AAPL',
    indicators: [
      { name: 'EPS', value: 5, description: '每股盈餘' },
      { name: 'P/E', value: 15, description: '本益比' },
      { name: 'P/B', value: 1.5, description: '股價淨值比' },
      { name: 'ROE', value: 0.18, description: '股東權益報酬率' },
      { name: 'D/E', value: 0.4, description: '負債權益比' },
      { name: 'FCF', value: 30_000, description: '自由現金流' },
    ],
    trends: {
      revenue: { qoq: 0.05, yoy: 0.10 },
      eps: { qoq: 0.08, yoy: 0.15 },
    },
    dataCompleteness: 'full',
    ...overrides,
  };
}

function makePartialAnalysis(): FundamentalAnalysis {
  return {
    ticker: 'TSLA',
    indicators: [
      { name: 'EPS', value: 3, description: '每股盈餘' },
      { name: 'P/E', value: null, description: '本益比', missingFields: ['incomeStatements'] },
      { name: 'P/B', value: 2, description: '股價淨值比' },
      { name: 'ROE', value: null, description: '股東權益報酬率', missingFields: ['balanceSheets'] },
      { name: 'D/E', value: 0.8, description: '負債權益比' },
      { name: 'FCF', value: 10_000, description: '自由現金流' },
    ],
    trends: {},
    dataCompleteness: 'partial',
  };
}

describe('evaluateInvestment', () => {
  it('returns a valid AnalysisReport with all required fields', () => {
    const analysis = makeFullAnalysis();
    const report = evaluateInvestment(analysis);

    expect(report.ticker).toBe('AAPL');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(['強力推薦', '推薦', '中性', '不推薦', '強力不推薦']).toContain(report.recommendation);
    expect(report.scoringBreakdown).toHaveLength(5);
    expect(report.disclaimer).toBe('本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。');
  });

  it('scoring breakdown weights sum to 1.0', () => {
    const report = evaluateInvestment(makeFullAnalysis());
    const totalWeight = report.scoringBreakdown.reduce((sum, item) => sum + item.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0);
  });

  it('each scoring item has correct weight assignments', () => {
    const report = evaluateInvestment(makeFullAnalysis());
    const byCategory = Object.fromEntries(report.scoringBreakdown.map((s) => [s.category, s]));

    expect(byCategory['獲利能力'].weight).toBe(0.25);
    expect(byCategory['估值合理性'].weight).toBe(0.25);
    expect(byCategory['財務健全度'].weight).toBe(0.20);
    expect(byCategory['現金流品質'].weight).toBe(0.15);
    expect(byCategory['成長趨勢'].weight).toBe(0.15);
  });

  it('each scoring item score is between 0 and 100', () => {
    const report = evaluateInvestment(makeFullAnalysis());
    for (const item of report.scoringBreakdown) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }
  });

  it('sets dataConfidence to high when dataCompleteness is full', () => {
    const report = evaluateInvestment(makeFullAnalysis());
    expect(report.dataConfidence).toBe('high');
    expect(report.missingData).toBeUndefined();
  });

  it('sets dataConfidence to low and populates missingData when dataCompleteness is partial', () => {
    const report = evaluateInvestment(makePartialAnalysis());
    expect(report.dataConfidence).toBe('low');
    expect(report.missingData).toBeDefined();
    expect(report.missingData!.length).toBeGreaterThan(0);
  });

  it('maps score >= 80 to 強力推薦', () => {
    // Create analysis with very strong indicators
    const analysis = makeFullAnalysis({
      indicators: [
        { name: 'EPS', value: 10, description: '' },
        { name: 'P/E', value: 8, description: '' },
        { name: 'P/B', value: 0.8, description: '' },
        { name: 'ROE', value: 0.25, description: '' },
        { name: 'D/E', value: 0.2, description: '' },
        { name: 'FCF', value: 60_000, description: '' },
      ],
      trends: {
        revenue: { qoq: 0.15, yoy: 0.25 },
        eps: { qoq: 0.20, yoy: 0.30 },
      },
    });
    const report = evaluateInvestment(analysis);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.recommendation).toBe('強力推薦');
  });

  it('maps score < 35 to 強力不推薦', () => {
    const analysis = makeFullAnalysis({
      indicators: [
        { name: 'EPS', value: -2, description: '' },
        { name: 'P/E', value: 50, description: '' },
        { name: 'P/B', value: 6, description: '' },
        { name: 'ROE', value: -0.1, description: '' },
        { name: 'D/E', value: 3, description: '' },
        { name: 'FCF', value: -20_000, description: '' },
      ],
      trends: {
        revenue: { qoq: -0.15, yoy: -0.25 },
      },
    });
    const report = evaluateInvestment(analysis);
    expect(report.score).toBeLessThan(35);
    expect(report.recommendation).toBe('強力不推薦');
  });

  it('generates strengths for good indicators', () => {
    const report = evaluateInvestment(makeFullAnalysis());
    expect(report.strengths.length).toBeGreaterThan(0);
    // With EPS=5, ROE=0.18, P/E=15, P/B=1.5, D/E=0.4, FCF=30000, revenue YoY=0.10
    // Should have multiple strengths
    expect(report.strengths.some((s) => s.includes('EPS'))).toBe(true);
    expect(report.strengths.some((s) => s.includes('ROE'))).toBe(true);
    expect(report.strengths.some((s) => s.includes('FCF'))).toBe(true);
  });

  it('generates risks for poor indicators', () => {
    const analysis = makeFullAnalysis({
      indicators: [
        { name: 'EPS', value: -1, description: '' },
        { name: 'P/E', value: 40, description: '' },
        { name: 'P/B', value: 5, description: '' },
        { name: 'ROE', value: -0.05, description: '' },
        { name: 'D/E', value: 2, description: '' },
        { name: 'FCF', value: -5_000, description: '' },
      ],
      trends: { revenue: { qoq: -0.02, yoy: -0.10 } },
    });
    const report = evaluateInvestment(analysis);
    expect(report.risks.length).toBeGreaterThan(0);
    expect(report.risks.some((r) => r.includes('EPS'))).toBe(true);
    expect(report.risks.some((r) => r.includes('D/E'))).toBe(true);
  });

  it('handles analysis with all null indicators gracefully', () => {
    const analysis: FundamentalAnalysis = {
      ticker: 'UNKNOWN',
      indicators: [
        { name: 'EPS', value: null, description: '', missingFields: ['incomeStatements'] },
        { name: 'P/E', value: null, description: '', missingFields: ['incomeStatements'] },
        { name: 'P/B', value: null, description: '', missingFields: ['balanceSheets'] },
        { name: 'ROE', value: null, description: '', missingFields: ['incomeStatements', 'balanceSheets'] },
        { name: 'D/E', value: null, description: '', missingFields: ['balanceSheets'] },
        { name: 'FCF', value: null, description: '', missingFields: ['cashFlowStatements'] },
      ],
      trends: {},
      dataCompleteness: 'partial',
    };
    const report = evaluateInvestment(analysis);

    expect(report.score).toBe(50); // All categories default to 50
    expect(report.recommendation).toBe('中性');
    expect(report.dataConfidence).toBe('low');
    expect(report.missingData).toBeDefined();
    expect(report.missingData!.length).toBeGreaterThan(0);
  });

  it('always includes the disclaimer', () => {
    const report1 = evaluateInvestment(makeFullAnalysis());
    const report2 = evaluateInvestment(makePartialAnalysis());
    const expected = '本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。';
    expect(report1.disclaimer).toBe(expected);
    expect(report2.disclaimer).toBe(expected);
  });
});

import { generateBatchSummary } from './analysisEngine.js';
import type { AnalysisReport, FailedTicker } from '../models/analysis.js';

// ── helpers for generateBatchSummary tests ──

function makeReport44(ticker: string, score: number): AnalysisReport {
  return {
    ticker,
    score,
    recommendation: '中性',
    scoringBreakdown: [
      { category: '獲利能力', weight: 0.25, score: 50, reason: 'test' },
      { category: '估值合理性', weight: 0.25, score: 50, reason: 'test' },
      { category: '財務健全度', weight: 0.20, score: 50, reason: 'test' },
      { category: '現金流品質', weight: 0.15, score: 50, reason: 'test' },
      { category: '成長趨勢', weight: 0.15, score: 50, reason: 'test' },
    ],
    strengths: [],
    risks: [],
    dataConfidence: 'high',
    disclaimer: '本分析報告僅供參考，不構成任何投資建議。投資人應自行判斷並承擔投資風險。',
  };
}

describe('generateBatchSummary', () => {
  it('produces correct counts and rankings sorted by score descending', () => {
    const reports: AnalysisReport[] = [
      makeReport44('AAPL', 70),
      makeReport44('TSLA', 85),
      makeReport44('GOOG', 60),
    ];
    const failed: FailedTicker[] = [
      { ticker: 'INVALID', reason: '無法辨識的股票代碼' },
    ];

    const batch = generateBatchSummary(reports, failed);

    expect(batch.totalRequested).toBe(4);
    expect(batch.totalCompleted).toBe(3);
    expect(batch.totalFailed).toBe(1);
    expect(batch.rankings).toHaveLength(3);
    expect(batch.rankings[0].ticker).toBe('TSLA');
    expect(batch.rankings[1].ticker).toBe('AAPL');
    expect(batch.rankings[2].ticker).toBe('GOOG');
    expect(batch.failedTickers).toEqual(failed);
  });

  it('handles empty reports with only failed tickers', () => {
    const failed: FailedTicker[] = [
      { ticker: 'BAD1', reason: 'error1' },
      { ticker: 'BAD2', reason: 'error2' },
    ];

    const batch = generateBatchSummary([], failed);

    expect(batch.totalRequested).toBe(2);
    expect(batch.totalCompleted).toBe(0);
    expect(batch.totalFailed).toBe(2);
    expect(batch.rankings).toHaveLength(0);
    expect(batch.failedTickers).toHaveLength(2);
  });

  it('handles empty failed tickers with only reports', () => {
    const reports = [makeReport44('AAPL', 80), makeReport44('MSFT', 75)];

    const batch = generateBatchSummary(reports, []);

    expect(batch.totalRequested).toBe(2);
    expect(batch.totalCompleted).toBe(2);
    expect(batch.totalFailed).toBe(0);
    expect(batch.rankings).toHaveLength(2);
    expect(batch.failedTickers).toHaveLength(0);
  });

  it('handles both empty reports and empty failed tickers', () => {
    const batch = generateBatchSummary([], []);

    expect(batch.totalRequested).toBe(0);
    expect(batch.totalCompleted).toBe(0);
    expect(batch.totalFailed).toBe(0);
    expect(batch.rankings).toHaveLength(0);
    expect(batch.failedTickers).toHaveLength(0);
  });

  it('handles a single report item', () => {
    const reports = [makeReport44('AAPL', 72)];
    const batch = generateBatchSummary(reports, []);

    expect(batch.totalRequested).toBe(1);
    expect(batch.totalCompleted).toBe(1);
    expect(batch.rankings).toHaveLength(1);
    expect(batch.rankings[0].ticker).toBe('AAPL');
  });

  it('does not mutate the original reports array', () => {
    const reports = [
      makeReport44('AAPL', 50),
      makeReport44('TSLA', 90),
      makeReport44('GOOG', 70),
    ];
    const originalOrder = reports.map((r) => r.ticker);

    generateBatchSummary(reports, []);

    expect(reports.map((r) => r.ticker)).toEqual(originalOrder);
  });
});
