import React, { useMemo, useState } from 'react';
import type { EmojiReactionQuestion as EmojiReactionQuestionType } from '../types/Question';
import { triggerSelectionSequence } from '../utils/selectionBurst';
import { config } from '../../config/config';

interface EmojiReactionQuestionProps {
  question: EmojiReactionQuestionType;
  selectedAnswer: string | null;
  onAnswer: (letterSegment: string) => void;
}

export const EmojiReactionQuestion: React.FC<EmojiReactionQuestionProps> = ({
  question,
  selectedAnswer,
  onAnswer,
}) => {
  const [animatingSegment, setAnimatingSegment] = useState<string | null>(null);

  // Shuffle feedback messages once per mount so each option gets a unique message
  const feedbackMessages = useMemo(() => {
    const msgs = [...config.emojiReactionFeedback];
    for (let i = msgs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [msgs[i], msgs[j]] = [msgs[j], msgs[i]];
    }
    return msgs;
  }, []);

  const handleClick = (letterSegment: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setAnimatingSegment(letterSegment);
    triggerSelectionSequence(e.currentTarget, e.clientX, e.clientY);
    onAnswer(letterSegment);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option.letterSegment;
          const isAnimating = animatingSegment === option.letterSegment;

          return (
            <button
              key={option.letterSegment}
              type="button"
              onClick={(e) => handleClick(option.letterSegment, e)}
              onAnimationEnd={() => {
                if (animatingSegment === option.letterSegment) {
                  setAnimatingSegment(null);
                }
              }}
              className={`group relative px-4 py-6 sm:px-5 sm:py-8 rounded-2xl border-2 transition-all duration-300 ${
                isSelected
                  ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 scale-105'
                  : 'border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.06] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/30 hover:scale-102 hover:shadow-md'
              } ${isAnimating ? 'animate-[selection-celebrate_0.6s_ease-out]' : ''}`}
            >
              <div className="flex flex-col items-center gap-2 sm:gap-3">
                <span className={`text-4xl sm:text-5xl transition-transform duration-300 ${
                  isSelected ? 'scale-110' : 'group-hover:scale-105'
                }`}>
                  {option.emoji}
                </span>

                <span className={`text-xs sm:text-sm font-medium text-center transition-colors duration-300 ${
                  isSelected ? 'text-emerald-900 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-200 group-hover:text-emerald-800 dark:group-hover:text-emerald-300'
                }`}>
                  {option.label}
                </span>
              </div>

              {isSelected && (
                <div className="absolute -top-2 -right-2 w-6 h-6 sm:w-7 sm:h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Reserve space so the card doesn't resize when feedback appears */}
      <p
        className={`text-center text-sm sm:text-base transition-opacity duration-300 ${
          selectedAnswer
            ? 'text-emerald-600 dark:text-emerald-400 opacity-100'
            : 'opacity-0'
        }`}
        aria-live="polite"
      >
        {selectedAnswer
          ? feedbackMessages[
              question.options.findIndex((o) => o.letterSegment === selectedAnswer) %
                feedbackMessages.length
            ]
          : feedbackMessages[0]}
      </p>
    </div>
  );
};
