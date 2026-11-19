import { describe, expect, it } from 'vitest';
import { contentRange, parseRangeHeader } from '../electron/range';

const SIZE = 1000;

describe('parseRangeHeader', () => {
  it('sends the whole file when there is no Range header', () => {
    expect(parseRangeHeader(null, SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('', SIZE)).toEqual({ kind: 'full' });
  });

  it('reads a closed range', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({ kind: 'partial', start: 0, end: 99 });
    expect(parseRangeHeader('bytes=100-100', SIZE)).toEqual({ kind: 'partial', start: 100, end: 100 });
  });

  it('reads an open-ended range, the form a browser uses to seek', () => {
    expect(parseRangeHeader('bytes=500-', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 });
    expect(parseRangeHeader('bytes=0-', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  it('reads a suffix range as the last N bytes', () => {
    expect(parseRangeHeader('bytes=-200', SIZE)).toEqual({ kind: 'partial', start: 800, end: 999 });
    expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  it('clamps an end past the last byte', () => {
    expect(parseRangeHeader('bytes=900-5000', SIZE)).toEqual({ kind: 'partial', start: 900, end: 999 });
  });

  it('refuses a start beyond the file, and an empty suffix', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it('ignores what it cannot use', () => {
    expect(parseRangeHeader('items=0-5', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=abc', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=-', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=9-3', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=0-5,10-20', SIZE)).toEqual({ kind: 'full' });
  });

  it('tolerates spacing and capitals', () => {
    expect(parseRangeHeader(' Bytes = 10 - 19 ', SIZE)).toEqual({ kind: 'partial', start: 10, end: 19 });
  });
});

describe('contentRange', () => {
  it('formats a partial and an unsatisfiable range', () => {
    expect(contentRange({ kind: 'partial', start: 0, end: 99 }, SIZE)).toBe('bytes 0-99/1000');
    expect(contentRange({ kind: 'unsatisfiable' }, SIZE)).toBe('bytes */1000');
    expect(contentRange({ kind: 'full' }, SIZE)).toBeNull();
  });
});
