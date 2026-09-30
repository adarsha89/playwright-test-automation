import { faker } from '@faker-js/faker';
import { STATE_MARKER_PREFIX } from '../framework/shared-browser.data';

/**
 * Random, per-call marker used as a cookie / storage key by the
 * shared-browser isolation tests. Being unique per call, a leaked value can
 * never be confused with a stale one from an earlier run.
 */
export function buildStateMarker(): string {
  return `${STATE_MARKER_PREFIX}${faker.string.alphanumeric(10)}`;
}
