import {
  chooseReview,
  loadReview,
  REVIEW_URL,
  ReviewChoice,
  shouldAsk,
} from '@/shared/util';

export async function initReview(): Promise<void> {
  const card = document.getElementById('review-card');
  if (!card) return;
  card.hidden = !shouldAsk(await loadReview());

  const answer = (choice: ReviewChoice) => {
    card.hidden = true;
    void chooseReview(choice);
  };

  document.getElementById('review-rate')?.addEventListener('click', () => {
    answer('reviewed');
    void chrome.tabs.create({ url: REVIEW_URL });
  });
  document.getElementById('review-later')?.addEventListener('click', () => {
    answer('later');
  });
  document.getElementById('review-never')?.addEventListener('click', () => {
    answer('never');
  });
}
