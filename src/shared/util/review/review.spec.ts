import { chrome } from 'jest-chrome';
import { REVIEW_STORAGE_KEY } from '../../consts';
import {
  chooseReview,
  loadReview,
  normaliseReview,
  REVIEW_SNOOZE,
  REVIEW_THRESHOLD,
  shouldAsk,
  usageCounter,
} from './review';

const get = chrome.storage.local.get as unknown as jest.Mock;
const set = chrome.storage.local.set as unknown as jest.Mock;

function stored(value: unknown): void {
  get.mockResolvedValue({ [REVIEW_STORAGE_KEY]: value });
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
}

describe('review', () => {
  beforeEach(() => {
    get.mockReset();
    set.mockReset().mockResolvedValue(undefined);
  });

  it('falls back to a fresh state for anything it does not recognise', () => {
    const fresh = { uses: 0, status: 'pending', askAt: REVIEW_THRESHOLD };
    expect(normaliseReview(undefined)).toEqual(fresh);
    expect(normaliseReview({ uses: -3, status: 'maybe', askAt: 'x' })).toEqual(
      fresh,
    );
    expect(normaliseReview({ uses: 7.6, status: 'later', askAt: 50 })).toEqual({
      uses: 7,
      status: 'later',
      askAt: 50,
    });
  });

  it('asks only once the threshold is crossed and the user has not answered for good', () => {
    const at = (uses: number, status = 'pending') =>
      shouldAsk(normaliseReview({ uses, status }));
    expect(at(REVIEW_THRESHOLD - 1)).toBe(false);
    expect(at(REVIEW_THRESHOLD)).toBe(true);
    expect(at(REVIEW_THRESHOLD, 'later')).toBe(true);
    expect(at(500, 'reviewed')).toBe(false);
    expect(at(500, 'never')).toBe(false);
  });

  it('loads a default when storage fails', async () => {
    get.mockRejectedValue(new Error('gone'));
    expect(await loadReview()).toEqual(normaliseReview(null));
  });

  it('remembers the answer and snoozes a later', async () => {
    stored({ uses: 25, status: 'pending', askAt: 20 });

    await chooseReview('later');
    expect(set).toHaveBeenLastCalledWith({
      [REVIEW_STORAGE_KEY]: {
        uses: 25,
        status: 'later',
        askAt: 25 + REVIEW_SNOOZE,
      },
    });

    await chooseReview('never');
    expect(set).toHaveBeenLastCalledWith({
      [REVIEW_STORAGE_KEY]: { uses: 25, status: 'never', askAt: 20 },
    });
  });

  it('batches uses into one write and stops once answered for good', async () => {
    jest.useFakeTimers();
    stored({ uses: 3, status: 'pending', askAt: 20 });

    const usage = usageCounter(100);
    usage.count();
    usage.count();
    usage.count();
    expect(set).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    await settle();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith({
      [REVIEW_STORAGE_KEY]: { uses: 6, status: 'pending', askAt: 20 },
    });

    stored({ uses: 6, status: 'reviewed', askAt: 20 });
    usage.count();
    jest.advanceTimersByTime(100);
    await settle();
    usage.count();
    jest.advanceTimersByTime(100);
    await settle();
    expect(set).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);

    const broken = usageCounter(100);
    set.mockRejectedValue(new Error('gone'));
    stored({ uses: 1 });
    broken.count();
    jest.advanceTimersByTime(100);
    await settle();
    expect(set).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
