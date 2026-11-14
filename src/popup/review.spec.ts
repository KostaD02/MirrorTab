/**
 * @jest-environment jsdom
 */

import { chrome } from 'jest-chrome';
import { REVIEW_STORAGE_KEY } from '@/shared/consts';
import { REVIEW_URL } from '@/shared/util';
import { initReview } from './review';

const get = chrome.storage.local.get as unknown as jest.Mock;
const set = chrome.storage.local.set as unknown as jest.Mock;
const create = chrome.tabs.create as unknown as jest.Mock;

async function settle(): Promise<void> {
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
}

describe('review card', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="review-card" hidden>
        <button id="review-rate"></button>
        <button id="review-later"></button>
        <button id="review-never"></button>
      </div>`;
    get.mockReset();
    set.mockReset().mockResolvedValue(undefined);
    create.mockReset().mockResolvedValue({});
  });

  const card = () => document.getElementById('review-card') as HTMLElement;
  const press = (id: string) => {
    document.getElementById(id)?.click();
  };

  it('stays hidden before the threshold', async () => {
    get.mockResolvedValue({ [REVIEW_STORAGE_KEY]: { uses: 3 } });

    await initReview();

    expect(card().hidden).toBe(true);
  });

  it('opens the store review page and remembers the review', async () => {
    get.mockResolvedValue({ [REVIEW_STORAGE_KEY]: { uses: 60 } });

    await initReview();
    expect(card().hidden).toBe(false);

    press('review-rate');
    expect(card().hidden).toBe(true);
    expect(create).toHaveBeenCalledWith({ url: REVIEW_URL });

    await settle();
    expect(set).toHaveBeenLastCalledWith({
      [REVIEW_STORAGE_KEY]: expect.objectContaining({ status: 'reviewed' }),
    });
  });

  it.each([
    ['review-later', 'later'],
    ['review-never', 'never'],
  ])('%s hides the card and stores %s', async (id, status) => {
    get.mockResolvedValue({ [REVIEW_STORAGE_KEY]: { uses: 60 } });

    await initReview();
    press(id);

    expect(card().hidden).toBe(true);
    expect(create).not.toHaveBeenCalled();
    await settle();
    expect(set).toHaveBeenLastCalledWith({
      [REVIEW_STORAGE_KEY]: expect.objectContaining({ status }),
    });
  });

  it('does nothing without the card', async () => {
    document.body.innerHTML = '';

    await initReview();

    expect(get).not.toHaveBeenCalled();
  });
});
