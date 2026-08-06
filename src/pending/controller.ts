import { formatCountdown, parsePendingParams } from '@/shared/util';

const TICK_MS = 250;

export class PendingPageController {
  private readonly dom = {
    countdown: document.getElementById('countdown') as HTMLSpanElement,
    targetUrl: document.getElementById('target-url') as HTMLSpanElement,
    note: document.getElementById('note') as HTMLParagraphElement,
    ring: document.getElementById('ring') as HTMLDivElement,
  };

  private timerId: ReturnType<typeof setInterval> | null = null;

  init(search: string = window.location.search): void {
    const params = parsePendingParams(search);

    if (!params) {
      this.showOpening();
      this.dom.targetUrl.textContent = '';
      return;
    }

    this.dom.targetUrl.textContent = params.url;
    document.title = `MirrorTab - waiting for ${params.url}`;

    this.tick(params.deadline);
    this.timerId = setInterval(() => {
      this.tick(params.deadline);
    }, TICK_MS);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tick(deadline: number): void {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      this.stop();
      this.showOpening();
      return;
    }

    this.dom.countdown.textContent = formatCountdown(remaining);
  }

  private showOpening(): void {
    this.dom.countdown.textContent = '';
    this.dom.ring.classList.add('is-opening');
    this.dom.note.textContent = 'Opening now…';
  }
}
