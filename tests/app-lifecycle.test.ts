import { describe, expect, it } from 'vitest';

import { shouldCommitUiBatch } from '../src/app-lifecycle';

describe('application lifecycle guards', () => {
  it('does not commit a queued UI batch after page teardown', () => {
    expect(shouldCommitUiBatch(false)).toBe(true);
    expect(shouldCommitUiBatch(true)).toBe(false);
  });
});
