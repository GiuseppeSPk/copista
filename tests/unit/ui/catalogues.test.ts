import { describe, expect, it } from 'vitest';
import { CATALOGUES, SAMPLE, catalogueHref } from '../../../src/ui/catalogues';

describe('catalogueHref', () => {
  const gutenberg = CATALOGUES.find((catalogue) => catalogue.name === 'Project Gutenberg')!;

  it('opens the home page when there is nothing to search for', () => {
    expect(catalogueHref(gutenberg, '')).toBe('https://www.gutenberg.org/');
    expect(catalogueHref(gutenberg, '   ')).toBe('https://www.gutenberg.org/');
  });

  it('searches for the trimmed, encoded query', () => {
    expect(catalogueHref(gutenberg, ' Alice & the Queen ')).toBe(
      'https://www.gutenberg.org/ebooks/search/?query=Alice%20%26%20the%20Queen',
    );
  });
});

describe('CATALOGUES', () => {
  it('links only to secure sites, and gives every one some classics', () => {
    for (const catalogue of CATALOGUES) {
      expect(catalogue.home).toMatch(/^https:\/\//);
      expect(catalogue.search).toMatch(/^https:\/\//);
      expect(catalogue.classics.length).toBeGreaterThan(0);
    }
  });

  it('samples one classic from each catalogue', () => {
    expect(SAMPLE).toHaveLength(CATALOGUES.length);
  });
});
