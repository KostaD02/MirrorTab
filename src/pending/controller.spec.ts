/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PendingPageController } from './controller';

const NOW = 1750000000000;

function loadPendingHtml(): void {
  const htmlPath = path.resolve(__dirname, 'index.html');
  const html = readFileSync(htmlPath, 'utf-8');
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : '';
}

const countdown = () => document.getElementById('countdown')!.textContent;
const note = () => document.getElementById('note')!.textContent;
const targetUrl = () => document.getElementById('target-url')!.textContent;

describe('PendingPageController', () => {
  let controller: PendingPageController;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    loadPendingHtml();
    controller = new PendingPageController();
  });

  afterEach(() => {
    controller.stop();
    jest.useRealTimers();
  });

  it('shows the target url and the remaining seconds', () => {
    controller.init(`?url=https://a.test&deadline=${String(NOW + 10000)}`);

    expect(targetUrl()).toBe('https://a.test');
    expect(countdown()).toBe('10');
  });

  it('counts down as time passes', () => {
    controller.init(`?url=https://a.test&deadline=${String(NOW + 10000)}`);

    jest.advanceTimersByTime(4000);
    expect(countdown()).toBe('6');

    jest.advanceTimersByTime(5000);
    expect(countdown()).toBe('1');
  });

  it('switches to the opening state once the deadline passes', () => {
    controller.init(`?url=https://a.test&deadline=${String(NOW + 2000)}`);

    jest.advanceTimersByTime(2500);

    expect(note()).toBe('Opening now…');
    expect(countdown()).toBe('');
    expect(document.getElementById('ring')!.classList).toContain('is-opening');
  });

  it('stops ticking after the deadline', () => {
    controller.init(`?url=https://a.test&deadline=${String(NOW + 1000)}`);
    jest.advanceTimersByTime(1500);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('falls back to the opening state when params are missing', () => {
    controller.init('');

    expect(note()).toBe('Opening now…');
    expect(targetUrl()).toBe('');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('sets the document title to the pending url', () => {
    controller.init(`?url=https://a.test&deadline=${String(NOW + 5000)}`);

    expect(document.title).toBe('MirrorTab - waiting for https://a.test');
  });
});
