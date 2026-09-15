import { describe, expect, it } from 'vitest';
import { DIRECTIVES } from './sprint-kickoff';

/**
 * The bridge arrival directive is the only thing standing between a PM who has
 * never met Ada and a stranger in a new tab handing back an opinion. The first
 * live handoff (2026-09-11) opened "I read your idea: …" with no introduction
 * at all, and read as cold. These pin the parts of the contract that made it
 * cold, so a future trim cannot quietly drop them again.
 */
describe('kickoff arrival directives', () => {
  const bj = DIRECTIVES.builder_journal;

  it('tells Ada to introduce herself, because the PM has never met her', () => {
    expect(bj).toMatch(/introduction/i);
    expect(bj).toMatch(/your name/i);
    expect(bj).toMatch(/not met you/i);
  });

  it('opens with a spoken greeting, not just her name', () => {
    // A1 gets her to name herself, which "I'm Ada, and I coach discovery"
    // satisfies while still starting mid-thought. The greeting is its own act.
    expect(bj).toMatch(/greeting/i);
    expect(bj).toMatch(/Hi, I'm Ada/i);
  });

  it('places where the PM came from', () => {
    expect(bj).toMatch(/Builder Journal/);
    expect(bj).toMatch(/already read what they brought over/i);
  });

  it('lets the introduction run past the persona length rule', () => {
    // The 2-4 sentence rule is written for a session already underway. Applied
    // to the very first reply it squeezes the introduction back out.
    expect(bj).toMatch(/more room than the persona's usual length/i);
    expect(bj).not.toMatch(/keep the persona's length rule/i);
  });

  it('still coaches rather than cheerleads', () => {
    expect(bj).toMatch(/pressure-test/i);
    expect(bj).toMatch(/no praise for the idea itself/i);
    expect(bj).toMatch(/what worries you most/i);
    expect(bj).toMatch(/one question/i);
  });

  it('keeps the machinery invisible on both arrival paths', () => {
    for (const d of Object.values(DIRECTIVES)) {
      expect(d).toMatch(/Do not mention that you were instructed to do this/);
    }
    expect(bj).toMatch(/never describe this message as automatic or generated/i);
  });

  it('leaves the native arrival alone — that PM is already inside Ada', () => {
    expect(DIRECTIVES.native).not.toMatch(/introduction/i);
    expect(DIRECTIVES.native).not.toMatch(/greeting/i);
    expect(DIRECTIVES.native).toMatch(/Keep the persona's length rule/);
  });
});
