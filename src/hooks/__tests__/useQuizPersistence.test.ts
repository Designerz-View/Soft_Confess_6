import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuizPersistence } from '../useQuizPersistence';

type Step = 'intro' | 'question' | 'score' | 'letter' | 'valentine';

interface QuizState {
  step: Step;
  questionIndex: number;
  answers: string[];
  emailSent: boolean;
}

type QuizAction =
  | { type: 'START_QUIZ' }
  | { type: 'ANSWER_QUESTION'; letterSegment: string }
  | { type: 'NEXT_QUESTION' }
  | { type: 'PREVIOUS_QUESTION' }
  | { type: 'SHOW_SCORE' }
  | { type: 'SHOW_LETTER' }
  | { type: 'SHOW_VALENTINE' }
  | { type: 'MARK_EMAIL_SENT' }
  | { type: 'RESTORE_STATE'; state: QuizState };

const STORAGE_KEY = 'quiz-state';

const mockState: QuizState = {
  step: 'question',
  questionIndex: 2,
  answers: ['answer1', 'answer2'],
  emailSent: false,
};

describe('useQuizPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('saves state to sessionStorage on state change', () => {
    const dispatch = vi.fn();

    renderHook(() => useQuizPersistence(mockState, dispatch));

    const stored = sessionStorage.getItem(STORAGE_KEY);
    expect(stored).toBe(JSON.stringify(mockState));
  });

  it('restores state from sessionStorage on mount', () => {
    const dispatch = vi.fn();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mockState));

    renderHook(() => useQuizPersistence(mockState, dispatch));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESTORE_STATE',
      state: mockState,
    });
  });

  it('clears sessionStorage when step is valentine', () => {
    const dispatch = vi.fn();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mockState));

    const valentineState: QuizState = {
      ...mockState,
      step: 'valentine',
    };

    renderHook(() => useQuizPersistence(valentineState, dispatch));

    const stored = sessionStorage.getItem(STORAGE_KEY);
    expect(stored).toBeNull();
  });

  it('handles invalid JSON in sessionStorage gracefully', () => {
    const dispatch = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    sessionStorage.setItem(STORAGE_KEY, 'invalid json {]');

    renderHook(() => useQuizPersistence(mockState, dispatch));

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESTORE_STATE' })
    );

    consoleErrorSpy.mockRestore();
  });
});
