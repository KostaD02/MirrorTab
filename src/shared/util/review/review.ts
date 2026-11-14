import { REVIEW_STORAGE_KEY } from '../../consts';

export type ReviewStatus = 'pending' | 'later' | 'reviewed' | 'never';
export type ReviewChoice = Exclude<ReviewStatus, 'pending'>;

export interface ReviewState {
  uses: number;
  status: ReviewStatus;
  askAt: number;
}

export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/mirrortab/bljopdbabofhephejfdlmclnjjipihpb/reviews';
export const REVIEW_THRESHOLD = 10;
export const REVIEW_SNOOZE = 10;

const STATUSES: readonly ReviewStatus[] = [
  'pending',
  'later',
  'reviewed',
  'never',
];

const count = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;

export function normaliseReview(raw: unknown): ReviewState {
  const stored =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<Record<keyof ReviewState, unknown>>)
      : {};
  const status = STATUSES.find((value) => value === stored.status);
  return {
    uses: count(stored.uses, 0),
    status: status ?? 'pending',
    askAt: count(stored.askAt, REVIEW_THRESHOLD),
  };
}

export async function loadReview(): Promise<ReviewState> {
  try {
    const data = await chrome.storage.local.get(REVIEW_STORAGE_KEY);
    return normaliseReview(data[REVIEW_STORAGE_KEY]);
  } catch {
    return normaliseReview(null);
  }
}

async function saveReview(state: ReviewState): Promise<void> {
  await chrome.storage.local.set({ [REVIEW_STORAGE_KEY]: state });
}

export function shouldAsk(state: ReviewState): boolean {
  return (
    (state.status === 'pending' || state.status === 'later') &&
    state.uses >= state.askAt
  );
}

export async function chooseReview(choice: ReviewChoice): Promise<void> {
  const state = await loadReview();
  await saveReview({
    ...state,
    status: choice,
    askAt: choice === 'later' ? state.uses + REVIEW_SNOOZE : state.askAt,
  });
}

export interface UsageCounter {
  count: () => void;
}

// ? uses close together cost one storage write, and counting stops once the user has answered for good
export function usageCounter(delay = 1000): UsageCounter {
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const flush = async (): Promise<void> => {
    timer = null;
    const added = pending;
    pending = 0;
    try {
      const state = await loadReview();
      if (state.status === 'reviewed' || state.status === 'never') {
        settled = true;
        return;
      }
      await saveReview({ ...state, uses: state.uses + added });
    } catch {
      // the worker can go down with the count still pending; it is only a hint
    }
  };

  return {
    count: () => {
      if (settled) return;
      pending += 1;
      timer ??= setTimeout(() => {
        void flush();
      }, delay);
    },
  };
}
