import { expect, test } from 'bun:test';
import { validateCases, renderGallery } from './template-screenshots.mjs';
test('screenshot evidence confines route input to the authorized origin and safe filenames', () => {
  const cases = [{ id: 'home', path: '/', surfaces: ['home', 'chrome.header'] }];
  expect(validateCases('https://staging.example', 'aster-house', cases)[0].url).toBe('https://staging.example/?template=aster-house');
  expect(() => validateCases('https://staging.example', 'aster-house', [{...cases[0],path:'https://other.example'}])).toThrow();
  expect(() => validateCases('https://staging.example', 'aster-house', [{...cases[0],id:'../outside'}])).toThrow();
  expect(() => validateCases('https://staging.example', 'aster-house', [...cases,...cases])).toThrow();
});

test('generated extension surface IDs work in screenshot cases without allowing selector syntax', () => {
  const item = { id: 'community-event', path: '/community-events/example', surfaces: ['community-events.detail', 'dashboard.community-events'] };
  expect(validateCases('https://staging.example', 'core', [item])[0].surfaces).toEqual(item.surfaces);
  for (const surface of ['home,body', 'home] [data-secret', '../outside', 'home"']) {
    expect(() => validateCases('https://staging.example', 'core', [{ ...item, surfaces: [surface] }])).toThrow();
  }
});

test('surface evidence gallery escapes authored titles and errors', () => {
  const html = renderGallery({ pack: '<script>bad</script>', createdAt: '', cases: [{ id: 'home', url: 'https://staging.example', error: '<img onerror=bad>', surfaces: [{surface:'home',file:'home-home.png'}] }] });
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
  expect(html).toContain('home-home.png');
  expect(html.includes('<img onerror=bad>')).toBe(false);
});
