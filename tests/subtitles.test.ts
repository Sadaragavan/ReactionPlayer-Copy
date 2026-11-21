import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanAssText, cuesAt, parseAss, parseSrt, parseSubtitleFile, parseTimestamp, parseVtt, splitLimit } from '../src/shared/subtitles';

const SRT = readFileSync(new URL('./fixtures/a.srt', import.meta.url), 'utf8');
const ASS = readFileSync(new URL('./fixtures/b.ass', import.meta.url), 'utf8');

describe('timestamps', () => {
  it('reads SubRip, WebVTT and ASS forms', () => {
    expect(parseTimestamp('00:01:02,500')).toBeCloseTo(62.5);
    expect(parseTimestamp('01:02.250')).toBeCloseTo(62.25);
    expect(parseTimestamp('1:02:03.45')).toBeCloseTo(3723.45);
    expect(parseTimestamp('nonsense')).toBeNaN();
  });
});

describe('SubRip', () => {
  const cues = parseSrt(SRT);
  it('reads each cue with its lines', () => {
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 3, text: 'Hello world' });
    expect(cues[1]).toMatchObject({ start: 4, end: 6.5, text: 'Second line\nwith two rows' });
  });
  it('drops markup, keeps whole-line italics, survives CRLF and a BOM', () => {
    const text = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Thinking</i>\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n<b>Bold</b> &amp; plain\r\n';
    const out = parseSrt(text);
    expect(out[0]).toMatchObject({ text: 'Thinking', italic: true });
    expect(out[1].text).toBe('Bold & plain');
  });
  it('skips broken blocks', () => {
    expect(parseSrt('1\nnot a time\ntext\n\n2\n00:00:01,000 --> 00:00:02,000\nok')).toHaveLength(1);
  });
});

describe('WebVTT', () => {
  it('ignores the header, identifiers and cue settings', () => {
    const out = parseVtt('WEBVTT\n\nintro\n00:01.000 --> 00:02.500 align:start position:10%\nHi there\n\nNOTE a comment\n');
    expect(out).toEqual([{ start: 1, end: 2.5, text: 'Hi there' }]);
  });
});

describe('ASS', () => {
  it('reads dialogue, strips overrides, and honours line breaks, italics and top placement', () => {
    const cues = parseAss(ASS);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1.5, end: 3.5, text: 'Konnichiwa\nsekai', italic: true, pos: 'top' });
    expect(cues[1]).toMatchObject({ start: 5, end: 7, text: 'Plain ASS line' });
  });
  it('keeps commas inside the text', () => {
    const out = parseAss('[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Well, yes, really');
    expect(out[0].text).toBe('Well, yes, really');
  });
  it('drops vector drawings', () => {
    expect(cleanAssText('{\\p1}m 0 0 l 10 10{\\p0}')).toBeNull();
  });
  it('splits with a limit', () => {
    expect(splitLimit('a,b,c,d', ',', 2)).toEqual(['a', 'b', 'c,d']);
  });
});

describe('parseSubtitleFile', () => {
  it('chooses by extension, and sniffs ASS without one', () => {
    expect(parseSubtitleFile('x.srt', SRT)).toHaveLength(2);
    expect(parseSubtitleFile('x.ass', ASS)).toHaveLength(2);
    expect(parseSubtitleFile('x.txt', ASS)).toHaveLength(2);
  });
});

describe('cuesAt', () => {
  const cues = parseSrt('1\n00:00:01,000 --> 00:00:05,000\nlong\n\n2\n00:00:02,000 --> 00:00:03,000\nshort\n\n3\n00:00:08,000 --> 00:00:09,000\nlate');
  it('finds the cue showing now, and overlapping ones', () => {
    expect(cuesAt(cues, 0.5)).toEqual([]);
    expect(cuesAt(cues, 1.5).map((c) => c.text)).toEqual(['long']);
    expect(cuesAt(cues, 2.5).map((c) => c.text)).toEqual(['long', 'short']);
    expect(cuesAt(cues, 4).map((c) => c.text)).toEqual(['long']);
    expect(cuesAt(cues, 6)).toEqual([]);
    expect(cuesAt(cues, 8.5).map((c) => c.text)).toEqual(['late']);
  });
  it('is end-exclusive and handles an empty list', () => {
    expect(cuesAt(cues, 9)).toEqual([]);
    expect(cuesAt([], 1)).toEqual([]);
  });
});
