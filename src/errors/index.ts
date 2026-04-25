export class TickerNotFoundError extends Error {
  constructor(public readonly ticker: string) {
    super(`無法辨識的股票代碼：${ticker}`);
    this.name = 'TickerNotFoundError';
  }
}

export class DataSourceUnavailableError extends Error {
  constructor(public readonly source: string) {
    super(`資料來源目前無法存取：${source}，請稍後重試`);
    this.name = 'DataSourceUnavailableError';
  }
}

export class ValidationError extends Error {
  constructor(public readonly fields: { field: string; reason: string }[]) {
    super('輸入參數驗證失敗');
    this.name = 'ValidationError';
  }
}
