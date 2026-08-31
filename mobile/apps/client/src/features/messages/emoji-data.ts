/** Compact emoji dataset — lazy-loaded separately from the main bundle. */

export type EmojiCategory = {
  id: string;
  labelEn: string;
  labelSo: string;
  emojis: string[];
};

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    labelEn: "Smileys",
    labelSo: "Dhoolacad",
    emojis: [
      "😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😍", "🥰", "😘",
      "🤗", "🤔", "😅", "😂", "🤣", "😌", "😴", "😇", "🤝", "👍",
    ],
  },
  {
    id: "gestures",
    labelEn: "Gestures",
    labelSo: "Tilmaamo",
    emojis: [
      "👋", "🤚", "✋", "🖖", "👌", "✌️", "🤞", "🤟", "🤘", "🤙",
      "👈", "👉", "👆", "👇", "☝️", "👏", "🙌", "👐", "🤲", "🙏",
    ],
  },
  {
    id: "hearts",
    labelEn: "Hearts",
    labelSo: "Qalbiyo",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨",
    ],
  },
  {
    id: "nature",
    labelEn: "Nature",
    labelSo: "Dabeecad",
    emojis: [
      "🌸", "🌹", "🌺", "🌻", "🌷", "🌴", "🌈", "☀️", "🌙", "⭐",
      "☕", "🍵", "🍯", "🧁", "🍰", "🎂", "🍎", "🍇", "🍉", "🍓",
    ],
  },
];

export const RECENT_KEY = "hel_emoji_recent_v1";
