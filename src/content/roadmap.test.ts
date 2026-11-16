import { describe, expect, it } from 'vitest';
import { ROADMAP_TEASER } from './landing';
import { ROADMAP, STATUS_ORDER, countByStatus } from './roadmap';

describe('public roadmap data', () => {
  it('has unique ids', () => {
    const ids = ROADMAP.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries no dates: no years and no month names', () => {
    const dated = /\b(20\d\d|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
    for (const item of ROADMAP) expect(item.title + ' ' + item.summary, item.id).not.toMatch(dated);
  });

  it('has something at every stage, and the counts add up', () => {
    const counts = countByStatus();
    for (const status of STATUS_ORDER) expect(counts[status]).toBeGreaterThan(0);
    expect(STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0)).toBe(ROADMAP.length);
  });

  it('uses no em or en dashes', () => {
    for (const item of ROADMAP) expect(item.title + item.summary, item.id).not.toMatch(/[–—]/);
  });

  it('the landing teaser points at items that exist and have not shipped', () => {
    for (const id of ROADMAP_TEASER.highlights) {
      const item = ROADMAP.find((entry) => entry.id === id);
      expect(item?.status, id).toMatch(/^(working|soon)$/);
    }
  });
});
