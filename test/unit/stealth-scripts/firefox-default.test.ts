import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { FIREFOX_DEFAULT_STEALTH } from '../../../src/stealth-scripts/firefox-default.js';

describe('firefox-default stealth payload', () => {
  it('parses as valid JavaScript', () => {
    expect(() => parse(FIREFOX_DEFAULT_STEALTH, { sourceType: 'script' })).not.toThrow();
  });

  it('mentions navigator.webdriver false override', () => {
    expect(FIREFOX_DEFAULT_STEALTH).toMatch(/webdriver/);
    expect(FIREFOX_DEFAULT_STEALTH).toMatch(/(false|defineProperty)/);
  });

  it('mentions __webdriver_ or cdc_ cleanup', () => {
    expect(FIREFOX_DEFAULT_STEALTH).toMatch(/(__webdriver_|cdc_)/);
  });

  it('mentions navigator.languages patch', () => {
    expect(FIREFOX_DEFAULT_STEALTH).toMatch(/languages/);
  });

  it('wraps in IIFE', () => {
    expect(FIREFOX_DEFAULT_STEALTH.trim()).toMatch(/^\(\s*function\s*\(/);
    expect(FIREFOX_DEFAULT_STEALTH.trim()).toMatch(/\)\(\s*\)\s*;?\s*$/);
  });

  it('defines window.chrome stub', () => {
    expect(FIREFOX_DEFAULT_STEALTH).toMatch(/window\.chrome/);
  });
});
