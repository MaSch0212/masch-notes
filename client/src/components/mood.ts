import { Angry, Frown, Laugh, Meh, Smile } from 'lucide-solid';

// Full class names so Tailwind can see them.
export const MOOD_BG = ['bg-mood-0', 'bg-mood-1', 'bg-mood-2', 'bg-mood-3', 'bg-mood-4'] as const;
export const MOOD_TEXT = [
  'text-mood-0',
  'text-mood-1',
  'text-mood-2',
  'text-mood-3',
  'text-mood-4',
] as const;
export const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh] as const;

export type MoodIndex = 0 | 1 | 2 | 3 | 4;
export const MOODS: readonly MoodIndex[] = [0, 1, 2, 3, 4];
