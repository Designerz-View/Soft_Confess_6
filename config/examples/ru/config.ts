/**
 * Valentine Quiz -- White-Label Configuration (Russian)
 * =====================================================
 *
 * Edit this file to customise every piece of user-facing text in the quiz.
 * No other source files need to be changed.
 *
 * Sections:
 *   names        - Recipient and sender names used across all screens
 *   pageTitle    - The browser tab / window title
 *   intro        - Welcome screen text and button labels
 *   scoreReveal  - The "100 % match" results screen
 *   loveLetter   - The personalised love letter screen
 *   valentine    - The "Will you be my Valentine?" prompt screen
 *   footer       - Small text at the bottom of every page
 *
 * Theme colours are controlled by Tailwind classes in the components and
 * by src/styles/questionVariants.ts -- edit those if you want different
 * colour palettes.
 */
export const config = {
  // ─── Names ──────────────────────────────────────────────────────────
  /** The recipient's name (the person taking the quiz) */
  recipientName: 'Имя Получателя',

  /** The sender's name (the person who created the quiz) */
  senderName: 'Имя Отправителя',

  // ─── Page title ─────────────────────────────────────────────────────
  /** Shown in the browser tab */
  pageTitle: "Викторина ко Дню Святого Валентина",

  // ─── Intro screen ──────────────────────────────────────────────────
  intro: {
    /** Greeting line above the recipient's name */
    greeting: "С Днем Святого Валентина",
    /** Main message paragraph */
    message: "Я создал этот маленький момент для нас. Небольшая викторина, чтобы отпраздновать нашу историю.",
    /** Instruction text below the message */
    instruction: "Ответь на эти 7 вопросов для меня :3",
    /** Text on the start button (emoji is appended automatically) */
    startButton: "Начнем",
    /** Small note below the button */
    timeEstimate: "Займет около 2 минут",
  },

  // ─── Score reveal screen ───────────────────────────────────────────
  scoreReveal: {
    /** Heading after the animated percentage */
    title: "Идеальное совпадение!",
    /** Body text explaining the score */
    message: "Идеальное совпадение. Мое сердце знало это всегда, но твои ответы заставляют его петь.",
    /** Label on the continue button (emoji appended automatically) */
    continueButton: "Посмотреть письмо",
  },

  // ─── Love letter screen ────────────────────────────────────────────
  loveLetter: {
    /** Section heading */
    heading: 'Письмо для тебя',
    /** Closing line before signature */
    closing: 'С улыбкой,',
    /** Signature prefix -- the senderName is appended automatically */
    signaturePrefix: 'Твой,',
    /** Label on the continue button (emoji appended automatically) */
    continueButton: 'Еще кое-что...',
  },

  // ─── Valentine prompt screen ───────────────────────────────────────
  valentine: {
    /** The big question */
    question: 'Ты будешь моим Валентином?',
    /** Subtitle under the question */
    subtitle: "Ты знаешь, что есть только один правильный ответ...",
    /** Label on the Yes button (emoji appended automatically) */
    yesButton: 'Да!',
    /** Label on the No button */
    noButton: 'Нет',
    /** Hint text at the bottom */
    hintText: '(Попробуй нажать "Нет", если осмелишься...)',
    /** Witty messages shown when the No button is clicked */
    noClickMessages: [
      'Хорошая попытка! Но ответ - Да!',
      'Упс! Не та кнопка!',
      'Ты уверен(а)? Подумай еще раз!',
      "Эта кнопка здесь не работает!",
      'Единственный ответ - Да!',
    ],
  },

  // ─── Footer ────────────────────────────────────────────────────────
  footer: {
    /** Footer text template. {sender} and {recipient} are replaced automatically. */
    text: 'Сделано с любовью {sender} для {recipient}',
  },
};
