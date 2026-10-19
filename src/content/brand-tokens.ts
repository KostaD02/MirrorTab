import brand from '@kostad/brand/tokens.json';

// ? the brand declares its tokens on :root, which a shadow root cannot see
export function brandTokens(selector: string): string {
  const values: Record<string, string> = {
    ...brand.token,
    ...brand.theme.dark,
  };
  const declarations = Object.entries(values)
    .map(([name, value]) => `--${brand.prefix}${name}: ${value};`)
    .join('\n  ');
  return `${selector} {\n  color-scheme: dark;\n  ${declarations}\n}\n`;
}
