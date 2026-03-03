/**
 * Valentine Quiz -- White-Label Configuration (Chinese)
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
  recipientName: '收件人姓名',

  /** The sender's name (the person who created the quiz) */
  senderName: '发件人姓名',

  // ─── Page title ─────────────────────────────────────────────────────
  /** Shown in the browser tab */
  pageTitle: "情人节测验",

  // ─── Intro screen ──────────────────────────────────────────────────
  intro: {
    /** Greeting line above the recipient's name */
    greeting: "情人节快乐",
    /** Main message paragraph */
    message: "我为我们创造了这个小小的时刻。一个小测验，以此庆祝我们的故事。",
    /** Instruction text below the message */
    instruction: "为我回答这 7 个问题 :3",
    /** Text on the start button (emoji is appended automatically) */
    startButton: "开始吧",
    /** Small note below the button */
    timeEstimate: "大约需要 2 分钟",
  },

  // ─── Score reveal screen ───────────────────────────────────────────
  scoreReveal: {
    /** Heading after the animated percentage */
    title: "完美契合！",
    /** Body text explaining the score */
    message: "完美契合。我的心一直都知道，但看到你的回答让它欢唱。",
    /** Label on the continue button (emoji appended automatically) */
    continueButton: "查看你的信",
  },

  // ─── Love letter screen ────────────────────────────────────────────
  loveLetter: {
    /** Section heading */
    heading: '给你的信',
    /** Closing line before signature */
    closing: '带着微笑，',
    /** Signature prefix -- the senderName is appended automatically */
    signaturePrefix: '属于你的，',
    /** Label on the continue button (emoji appended automatically) */
    continueButton: '还有一件事...',
  },

  // ─── Valentine prompt screen ───────────────────────────────────────
  valentine: {
    /** The big question */
    question: '你愿意做我的情人吗？',
    /** Subtitle under the question */
    subtitle: "你知道只有一个正确答案...",
    /** Label on the Yes button (emoji appended automatically) */
    yesButton: '愿意！',
    /** Label on the No button */
    noButton: '不愿意',
    /** Hint text at the bottom */
    hintText: '(如果你敢的话，试着点“不愿意”...)',
    /** Witty messages shown when the No button is clicked */
    noClickMessages: [
      '不错的尝试！但答案是愿意！',
      '哎呀！点错了！',
      '你确定吗？再想一想！',
      '那个按钮在这里不起作用！',
      '唯一的答案是愿意！',
    ],
  },

  // ─── Footer ────────────────────────────────────────────────────────
  footer: {
    /** Footer text template. {sender} and {recipient} are replaced automatically. */
    text: '由 {sender} 用爱为 {recipient} 制作',
  },
};
