/**
 * @jest-environment jsdom
 */

import {
  getUniqueSelector,
  getElementMeta,
  getSemanticSelector,
  resolveSelector,
} from './selector';

describe('selector util', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getUniqueSelector', () => {
    it('should generate a unique selector for an element', () => {
      document.body.innerHTML = `
        <div>
          <p>first</p>
          <p id="target">second</p>
          <p>third</p>
        </div>
      `;
      const target = document.getElementById('target') as HTMLElement;
      const selector = getUniqueSelector(target);

      expect(selector).toBe(
        'body:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(2)',
      );
      expect(document.querySelector(selector)).toBe(target);
    });

    it('should return tag name if element has no parent', () => {
      const el = document.createElement('div');
      expect(getUniqueSelector(el)).toBe('div');
    });

    it('should handle elements directly under document Element correctly', () => {
      const el = document.body;
      const selector = getUniqueSelector(el);
      expect(selector).toBe('body:nth-of-type(1)');
    });
  });

  describe('getElementMeta', () => {
    it('should return basic tag name if no attributes exist', () => {
      const el = document.createElement('div');
      expect(getElementMeta(el)).toBe('div');
    });

    it('should include ID in meta', () => {
      const el = document.createElement('span');
      el.id = 'my-id';
      expect(getElementMeta(el)).toBe('span#my-id');
    });

    it('should include the first class in meta', () => {
      const el = document.createElement('button');
      el.classList.add('btn', 'primary');
      expect(getElementMeta(el)).toBe('button.btn');
    });

    it('should include ID and first class', () => {
      const el = document.createElement('a');
      el.id = 'link';
      el.classList.add('nav-link');
      expect(getElementMeta(el)).toBe('a#link.nav-link');
    });

    it('should include recognized id attributes', () => {
      const el = document.createElement('input');
      el.setAttribute('name', 'username');
      el.setAttribute('data-id', '123');
      expect(getElementMeta(el)).toBe('input[name=username]');
    });

    it('should fall back to other recognized id attributes if earlier ones are missing', () => {
      const el = document.createElement('div');
      el.setAttribute('aria-label', 'Close');
      expect(getElementMeta(el)).toBe('div[aria-label=Close]');
    });
  });

  describe('getSemanticSelector', () => {
    beforeAll(() => {
      if (typeof CSS === 'undefined') {
        Object.defineProperty(global, 'CSS', {
          value: { escape: (str: string) => str },
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } else if (!CSS.escape) {
        CSS.escape = (str: string) => str;
      }
    });

    it('should return ID selector if ID is unique in the document', () => {
      document.body.innerHTML = `
        <div id="unique-box"></div>
        <div></div>
      `;
      const el = document.getElementById('unique-box') as HTMLElement;
      expect(getSemanticSelector(el)).toBe('#unique-box');
    });

    it('should fallback to getUniqueSelector if ID is not unique', () => {
      document.body.innerHTML = `
        <div id="duplicate"></div>
        <div id="duplicate" class="target"></div>
      `;
      const el = document.querySelector('.target') as HTMLElement;
      expect(getSemanticSelector(el)).not.toBe('#duplicate');
      expect(getSemanticSelector(el)).toContain('div:nth-of-type(2)');
    });

    it('should fall back to getUniqueSelector if no ID is present', () => {
      document.body.innerHTML = `
        <div>
          <span>target</span>
        </div>
      `;
      const el = document.querySelector('span') as HTMLElement;
      expect(getSemanticSelector(el)).toBe(
        'body:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1)',
      );
    });
  });
});

describe('shadow DOM selectors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function mountShadow() {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const first = document.createElement('button');
    const second = document.createElement('button');
    second.id = 'inner';
    root.append(first, second);
    return { host, root, first, second };
  }

  it('prefixes the host path and joins with the shadow separator', () => {
    const { second } = mountShadow();

    expect(getSemanticSelector(second)).toBe('#host >>> #inner');
  });

  it('positions elements by siblings inside the shadow root', () => {
    const { second } = mountShadow();
    second.removeAttribute('id');

    expect(getSemanticSelector(second)).toBe('#host >>> button:nth-of-type(2)');
  });

  it('resolves through each host in turn', () => {
    const { host, second } = mountShadow();

    expect(resolveSelector('#host >>> #inner')).toBe(second);
    expect(resolveSelector('#host')).toBe(host);
    expect(resolveSelector('#host >>> #missing')).toBeNull();
    expect(resolveSelector('#nobody >>> #inner')).toBeNull();
  });

  it('returns null past an element without a shadow root', () => {
    const plain = document.createElement('div');
    plain.id = 'plain';
    document.body.appendChild(plain);

    expect(resolveSelector('#plain >>> button')).toBeNull();
  });
});
