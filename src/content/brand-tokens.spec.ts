import { brandTokens } from './brand-tokens';

describe('brandTokens', () => {
  it('declares the dark theme and the shared tokens on the given selector', () => {
    const css = brandTokens(':host');
    expect(css.startsWith(':host {')).toBe(true);
    expect(css).toContain('color-scheme: dark;');
    expect(css).toContain('--kd-bg: #0a192f;');
    expect(css).toContain('--kd-accent: #64ffda;');
    expect(css).toContain('--kd-danger: #ff6363;');
    expect(css).toContain('--kd-radius-pill: 999px;');
    expect(css).not.toContain('--kd-bg: #f5f7fb;');
  });
});
