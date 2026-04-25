import { describe, it, expect } from 'vitest';
import {
  FundamentalIndicatorSchema,
  TrendDataSchema,
  FundamentalAnalysisSchema,
  RecommendationSchema,
  ScoringItemSchema,
  AnalysisReportSchema,
  FailedTickerSchema,
  BatchReportSchema,
} from './analysis.js';

describe('FundamentalIndicatorSchema', () => {
  it('parses a valid indicator with value', () => {
    const data = {
      name: 'EPS',
      value: 5.2,
      description: 'Earnings per share',
    };
    expect(FundamentalIndicatorSchema.parse(data)).toEqual(data);
  });

  it('parses an indicator with null value and missingFields', () => {
    const data = {
      name: 'P/E',
      value: null,
      description: 'Price to earnings ratio',
      missingFields: ['eps', 'price'],
    };
    expect(FundamentalIndicatorSchema.parse(data)).toEqual(data);
  });

  it('parses without optional missingFields', () => {
    const data = { name: 'ROE', value: 0.15, description: 'Return on equity' };
    const result = FundamentalIndicatorSchema.parse(data);
    expect(result.missingFields).toBeUndefined();
  });

  it('rejects missing fields', () => {
    expect(() => FundamentalIndicatorSchema.parse({ name: 'EPS' })).toThrow();
  });
});

describe('TrendDataSchema', () => {
  it('parses valid trend data', () => {
    const data = { qoq: 5.2, yoy: 12.3 };
    expect(TrendDataSchema.parse(data)).toEqual(data);
  });

  it('parses trend data with null values', () => {
    const data = { qoq: null, yoy: null };
    expect(TrendDataSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => TrendDataSchema.parse({ qoq: 5.2 })).toThrow();
  });
});

describe('FundamentalAnalysisSchema', () => {
  it('parses a valid fundamental analysis', () => {
    const data = {
      ticker: 'AAPL',
      indicators: [
        { name: 'EPS', value: 6.5, description: 'Earnings per share' },
      ],
      trends: {
        eps: { qoq: 3.2, yoy: 10.5 },
      },
      dataCompleteness: 'full',
    };
    expect(FundamentalAnalysisSchema.parse(data)).toEqual(data);
  });

  it('parses with partial data completeness', () => {
    const data = {
      ticker: 'TSLA',
      indicators: [],
      trends: {},
      dataCompleteness: 'partial',
    };
    expect(FundamentalAnalysisSchema.parse(data)).toEqual(data);
  });

  it('rejects invalid dataCompleteness value', () => {
    expect(() =>
      FundamentalAnalysisSchema.parse({
        ticker: 'AAPL',
        indicators: [],
        trends: {},
        dataCompleteness: 'unknown',
      }),
    ).toThrow();
  });
});

describe('RecommendationSchema', () => {
  it.each(['強力推薦', '推薦', '中性', '不推薦', '強力不推薦'])('accepts "%s"', (val) => {
    expect(RecommendationSchema.parse(val)).toBe(val);
  });

  it('rejects invalid recommendation', () => {
    expect(() => RecommendationSchema.parse('買入')).toThrow();
  });
});

describe('ScoringItemSchema', () => {
  it('parses a valid scoring item', () => {
    const data = { category: '獲利能力', weight: 0.3, score: 85, reason: 'EPS 穩定成長' };
    expect(ScoringItemSchema.parse(data)).toEqual(data);
  });

  it('rejects weight out of range', () => {
    expect(() =>
      ScoringItemSchema.parse({ category: 'test', weight: 1.5, score: 50, reason: 'r' }),
    ).toThrow();
  });

  it('rejects score out of range', () => {
    expect(() =>
      ScoringItemSchema.parse({ category: 'test', weight: 0.5, score: 150, reason: 'r' }),
    ).toThrow();
  });
});

describe('AnalysisReportSchema', () => {
  const validReport = {
    ticker: 'AAPL',
    score: 78,
    recommendation: '推薦' as const,
    scoringBreakdown: [
      { category: '獲利能力', weight: 0.5, score: 80, reason: '穩定' },
      { category: '財務健全', weight: 0.5, score: 76, reason: '良好' },
    ],
    strengths: ['高 EPS'],
    risks: ['估值偏高'],
    dataConfidence: 'high' as const,
    disclaimer: '本分析僅供參考',
  };

  it('parses a valid analysis report', () => {
    expect(AnalysisReportSchema.parse(validReport)).toEqual(validReport);
  });

  it('parses with optional missingData', () => {
    const data = { ...validReport, missingData: ['cashFlow'] };
    expect(AnalysisReportSchema.parse(data)).toEqual(data);
  });

  it('rejects score out of range', () => {
    expect(() => AnalysisReportSchema.parse({ ...validReport, score: 101 })).toThrow();
  });

  it('rejects invalid recommendation', () => {
    expect(() => AnalysisReportSchema.parse({ ...validReport, recommendation: 'BUY' })).toThrow();
  });
});

describe('FailedTickerSchema', () => {
  it('parses a valid failed ticker', () => {
    const data = { ticker: 'INVALID', reason: '無法辨識的股票代碼' };
    expect(FailedTickerSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => FailedTickerSchema.parse({ ticker: 'X' })).toThrow();
  });
});

describe('BatchReportSchema', () => {
  it('parses a valid batch report', () => {
    const data = {
      totalRequested: 3,
      totalCompleted: 2,
      totalFailed: 1,
      rankings: [
        {
          ticker: 'AAPL',
          score: 85,
          recommendation: '推薦',
          scoringBreakdown: [],
          strengths: [],
          risks: [],
          dataConfidence: 'high',
          disclaimer: '免責聲明',
        },
      ],
      failedTickers: [{ ticker: 'BAD', reason: '找不到' }],
    };
    expect(BatchReportSchema.parse(data)).toEqual(data);
  });

  it('parses an empty batch report', () => {
    const data = {
      totalRequested: 0,
      totalCompleted: 0,
      totalFailed: 0,
      rankings: [],
      failedTickers: [],
    };
    expect(BatchReportSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => BatchReportSchema.parse({ totalRequested: 1 })).toThrow();
  });
});
