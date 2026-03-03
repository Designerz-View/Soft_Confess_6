import { describe, it, expect } from 'vitest';
import { triggerCelebration, triggerTopCelebration, triggerCenterCelebration } from '../utils/confetti';

describe('confetti utility', () => {
  it('exports triggerCelebration function', () => {
    expect(typeof triggerCelebration).toBe('function');
  });

  it('exports triggerTopCelebration function', () => {
    expect(typeof triggerTopCelebration).toBe('function');
  });

  it('exports triggerCenterCelebration function', () => {
    expect(typeof triggerCenterCelebration).toBe('function');
  });

  it('triggerCelebration returns a promise', () => {
    const result = triggerCelebration();
    expect(result).toBeInstanceOf(Promise);
  });

  it('triggerTopCelebration returns a promise', () => {
    const result = triggerTopCelebration();
    expect(result).toBeInstanceOf(Promise);
  });

  it('triggerCenterCelebration returns a promise', () => {
    const result = triggerCenterCelebration();
    expect(result).toBeInstanceOf(Promise);
  });
});
