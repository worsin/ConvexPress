import { expect, test } from 'bun:test';
import { matchesCurrentSearchText } from '../currentMatch';

test('current text uses whole lowercase Unicode terms and only the last-term prefix',()=>{
  expect(matchesCurrentSearchText('orch','Orchid workshop')).toBe(true);
  expect(matchesCurrentSearchText('orch missing','Orchid workshop')).toBe(false);
  expect(matchesCurrentSearchText('orchid missing','Orchid workshop')).toBe(true);
  expect(matchesCurrentSearchText('body','Nobody knows')).toBe(false);
  expect(matchesCurrentSearchText('CAFÉ—42','Café', '42nd street')).toBe(true);
  expect(matchesCurrentSearchText('cafe','Café')).toBe(false);
  expect(matchesCurrentSearchText('!!!','Anything')).toBe(false);
  expect(matchesCurrentSearchText('x'.repeat(33),'x'.repeat(33))).toBe(false);
  expect(matchesCurrentSearchText('visible','Hidden', 'Visible body')).toBe(true);
});
