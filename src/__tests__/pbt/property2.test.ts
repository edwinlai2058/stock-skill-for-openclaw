// Feature: openclaw-stock-analysis-skill, Property 2: 無效 Ticker 產生正確錯誤
// **Validates: Requirements 1.5**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DataFetcher } from '../../services/dataFetcher.js';
import { TickerNotFoundError } from '../../errors/index.js';

/**
 * The valid ticker regex used by DataFetcher (after trim + toUpperCase normalization):
 *   /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/
 *
 * An invalid ticker is any string that, after trim().toUpperCase(), does NOT match this regex.
 */
const VALID_TICKER_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

/** Returns true if the string would be considered valid after normalization. */
function isValidAfterNormalization(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const normalized = s.trim().toUpperCase();
  if (normalized.length === 0) return false;
  return VALID_TICKER_REGEX.test(normalized);
}

// --- Arbitraries for invalid ticker strings ---

/** Empty string — always invalid. */
const emptyStringArb = fc.constant('');

/** Whitespace-only strings — invalid after trim. */
const whitespaceOnlyArb = fc.stringMatching(/^[\s]+$/);

/** Strings with special characters (non-alpha, non-whitespace). */
const specialCharArb = fc.stringMatching(/^[!@#$%^&*()_+=\[\]{}<>?/\\|~`,:;"-]+$/);

/** Pure numeric strings. */
const numericStringArb = fc.stringMatching(/^[0-9]{1,10}$/);

/** Strings exceeding 5 alpha characters (too long for a valid ticker). */
const tooLongAlphaArb = fc.stringMatching(/^[A-Z]{6,15}$/);

/** General random strings filtered to exclude anything that normalizes to a valid ticker. */
const generalInvalidArb = fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !isValidAfterNormalization(s));

/** Combined arbitrary that picks from all invalid ticker strategies. */
const invalidTickerArb = fc.oneof(
  emptyStringArb,
  whitespaceOnlyArb,
  specialCharArb,
  numericStringArb,
  tooLongAlphaArb,
  generalInvalidArb,
);

describe('Property 2: 無效 Ticker 產生正確錯誤', () => {
  const fetcher = new DataFetcher('test-key');

  it('validateTicker throws TickerNotFoundError for any invalid ticker', () => {
    fc.assert(
      fc.property(invalidTickerArb, (ticker) => {
        expect(() => fetcher.validateTicker(ticker)).toThrow(TickerNotFoundError);
      }),
      { numRuns: 100 },
    );
  });

  it('TickerNotFoundError message contains the invalid ticker string', () => {
    fc.assert(
      fc.property(invalidTickerArb, (ticker) => {
        try {
          fetcher.validateTicker(ticker);
          // Should not reach here
          expect.unreachable('validateTicker should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(TickerNotFoundError);
          const error = err as TickerNotFoundError;
          expect(error.message).toContain(String(ticker));
        }
      }),
      { numRuns: 100 },
    );
  });
});
