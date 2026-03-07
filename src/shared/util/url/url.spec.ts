import { normaliseUrl } from './url';

describe('url util', () => {
  const testUrl = 'konstantinedatunishvili.com';
  describe('normaliseUrl', () => {
    it('should return empty string if input is empty or only whitespace', () => {
      expect(normaliseUrl('')).toBe('');
      expect(normaliseUrl('   ')).toBe('');
      expect(normaliseUrl('\n\t')).toBe('');
    });

    it('should prepend https:// if missing', () => {
      expect(normaliseUrl(testUrl)).toBe(`https://${testUrl}`);
      expect(normaliseUrl(`www.${testUrl}/path`)).toBe(
        `https://www.${testUrl}/path`,
      );
      expect(normaliseUrl('localhost:3000')).toBe('https://localhost:3000');
    });

    it('should not prepend https:// if http:// or https:// is already present', () => {
      expect(normaliseUrl(`https://${testUrl}`)).toBe(`https://${testUrl}`);
      expect(normaliseUrl(`http://${testUrl}`)).toBe(`http://${testUrl}`);
    });

    it('should handle case insensitivity for protocols', () => {
      const upperUrl = testUrl.toUpperCase();
      expect(normaliseUrl(`HTTPS://${upperUrl}`)).toBe(`HTTPS://${upperUrl}`);
      expect(normaliseUrl(`Http://${testUrl}`)).toBe(`Http://${testUrl}`);
    });

    it('should trim whitespace before checking and appending', () => {
      expect(normaliseUrl(`  ${testUrl}  `)).toBe(`https://${testUrl}`);
      expect(normaliseUrl(`  https://${testUrl}  `)).toBe(`https://${testUrl}`);
    });
  });
});
