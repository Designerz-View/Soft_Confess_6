export interface BaseQuestion {
  id: string;
  question: string;
  designVariant: string;
  videoSrc?: string;
}

export interface MultipleChoiceOption {
  text: string;
  letterSegment: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multipleChoice';
  options: MultipleChoiceOption[];
}

export interface HeartRatingOption {
  hearts: number;
  letterSegment: string;
}

export interface HeartRatingQuestion extends BaseQuestion {
  type: 'heartRating';
  maxHearts: number;
  options: HeartRatingOption[];
}

export interface YesNoOption {
  value: 'yes' | 'no';
  text: string;
  letterSegment: string;
}

export interface YesNoQuestion extends BaseQuestion {
  type: 'yesNo';
  options: [YesNoOption, YesNoOption];
}

export interface EmojiReactionOption {
  emoji: string;
  label: string;
  letterSegment: string;
}

export interface EmojiReactionQuestion extends BaseQuestion {
  type: 'emojiReaction';
  options: EmojiReactionOption[];
}

export type Question =
  | MultipleChoiceQuestion
  | HeartRatingQuestion
  | YesNoQuestion
  | EmojiReactionQuestion;
