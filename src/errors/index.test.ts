import { describe, it, expect } from 'vitest';
import { TickerNotFoundError, DataSourceUnavailableError, ValidationError } from './index';

describe('TickerNotFoundError', () => {
  it('should set message with ticker', () => {
    const err = new TickerNotFoundError('INVALID');
    expect(err.message).toBe('無法辨識的股票代碼：INVALID');
    expect(err.ticker).toBe('INVALID');
    expect(err.name).toBe('TickerNotFoundError');
    expect(err).toBeInstanceOf(Error);
  });

  it('should work with empty ticker', () => {
    const err = new TickerNotFoundError('');
    expect(err.message).toBe('無法辨識的股票代碼：');
    expect(err.ticker).toBe('');
  });
});

describe('DataSourceUnavailableError', () => {
  it('should set message with source', () => {
    const err = new DataSourceUnavailableError('Yahoo Finance');
    expect(err.message).toBe('資料來源目前無法存取：Yahoo Finance，請稍後重試');
    expect(err.source).toBe('Yahoo Finance');
    expect(err.name).toBe('DataSourceUnavailableError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('should set message and fields', () => {
    const fields = [
      { field: 'ticker', reason: '不可為空' },
      { field: 'period', reason: '格式不正確' },
    ];
    const err = new ValidationError(fields);
    expect(err.message).toBe('輸入參數驗證失敗');
    expect(err.fields).toEqual(fields);
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(Error);
  });

  it('should work with empty fields array', () => {
    const err = new ValidationError([]);
    expect(err.fields).toEqual([]);
  });
});
