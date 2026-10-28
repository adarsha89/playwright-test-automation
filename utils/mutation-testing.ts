import type { Locator } from '@playwright/test';
import { env } from '../config/env';

/** Applies a deterministic UI defect only during an explicitly enabled mutation run. */
export async function applyUiMutation(target: Locator, mutation: 'hide' | 'replace-text'): Promise<void> {
  if (!env.MUTATION_ENABLED) {
    return;
  }

  const count = await target.count();
  if (count !== 1) {
    throw new Error(`Cannot apply UI mutation: expected one target, found ${count}.`);
  }

  if (mutation === 'hide') {
    await target.evaluate((element) => element.style.setProperty('display', 'none', 'important'));
  } else {
    await target.evaluate((element) => {
      element.textContent = 'Mutated content';
    });
  }
}
