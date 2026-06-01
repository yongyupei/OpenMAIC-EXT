import { describe, expect, it } from 'vitest';

import {
  registerExtensions,
  resetExtensionsRegistrationForTests,
} from '@extends/bootstrap';

describe('registerExtensions', () => {
  it('runs idempotently', () => {
    resetExtensionsRegistrationForTests();
    expect(() => registerExtensions()).not.toThrow();
    expect(() => registerExtensions()).not.toThrow();
  });
});
