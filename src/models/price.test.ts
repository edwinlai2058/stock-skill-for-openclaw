import { describe, it, expect } from 'vitest';
import {
  StockQuoteSchema,
  DailyPriceSchema,
  PriceHistorySchema,
} from './price.js';

describe('StockQuoteSchema', () => {
  it('parses a valid stock quote', () => {
    const data = {
      ticker: 'AAPL',
      price: 195.5,
      change: 2.3,
      changePercent: 1.19,
      volume: 54000000,
      timestamp: '2024-06-15T16:00:00Z',
    };
    expect(StockQuoteSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => StockQuoteSchema.parse({ ticker: 'AAPL' })).toThrow();
  });

  it('rejects invalid field types', () => {
    expect(() =>
      StockQuoteSchema.parse({
        ticker: 'AAPL',
        price: 'not-a-number',
        change: 0,
        changePercent: 0,
        volume: 0,
        timestamp: '2024-06-15T16:00:00Z',
      }),
    ).toThrow();
  });
});

describe('DailyPriceSchema', () => {
  it('parses a valid daily price', () => {
    const data = {
      date: '2024-06-14',
      close: 195.5,
      open: 193.0,
      high: 196.2,
      low: 192.8,
      volume: 48000000,
    };
    expect(DailyPriceSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => DailyPriceSchema.parse({ date: '2024-06-14' })).toThrow();
  });
});

describe('PriceHistorySchema', () => {
  it('parses a valid price history', () => {
    const data = {
      ticker: 'TSLA',
      period: '1y',
      prices: [
        { date: '2024-06-14', close: 180.0, open: 178.5, high: 181.2, low: 177.0, volume: 90000000 },
        { date: '2024-06-13', close: 178.5, open: 176.0, high: 179.0, low: 175.5, volume: 85000000 },
      ],
    };
    expect(PriceHistorySchema.parse(data)).toEqual(data);
  });

  it('parses a price history with empty prices array', () => {
    const data = {
      ticker: 'MSFT',
      period: '3m',
      prices: [],
    };
    expect(PriceHistorySchema.parse(data)).toEqual(data);
  });

  it('rejects missing ticker', () => {
    expect(() =>
      PriceHistorySchema.parse({
        period: '1y',
        prices: [],
      }),
    ).toThrow();
  });

  it('rejects invalid nested items', () => {
    expect(() =>
      PriceHistorySchema.parse({
        ticker: 'AAPL',
        period: '1y',
        prices: [{ date: '2024-06-14' }],
      }),
    ).toThrow();
  });
});
