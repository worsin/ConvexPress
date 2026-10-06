/**
 * Apply Customize's finite type scale after Tailwind and CSS imports compile.
 * Keep rem's root unchanged: changing html's size also resizes layout. Relative
 * em/% sizes already inherit the scaled parent and must not be scaled twice.
 */
const ROOT = /^(?:html|:root|:host(?:\([^)]*\))?)$/i;
const SIZE = /^(?:[+-]?(?:\d*\.)?\d+(?:rem|px|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax)|(?:calc|min|max|clamp|var)\()/i;
const RELATIVE = /(?:\d|\.)(?:em|ex|ch|cap|ic|lh)\b|%/i;

function scaled(value) {
  if (!SIZE.test(value) || RELATIVE.test(value) || value.includes('--type-scale')) return value;
  return `calc(${value} * var(--type-scale, 1))`;
}

// Only whitespace and slashes outside functions/strings delimit shorthand
// tokens. This keeps clamp(), nested var() fallbacks and quoted fonts intact.
function tokens(value) {
  const result = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i <= value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (i === value.length || (depth === 0 && /[\s/]/.test(char))) {
      if (i > start) result.push({ value: value.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  return result;
}

export function typeScale() {
  return {
    postcssPlugin: 'convexpress-type-scale',
    Declaration(decl) {
      if (decl.prop !== 'font-size' && decl.prop !== 'font') return;
      if (decl.parent.type !== 'rule') return;
      // A shared root rule is deliberately left alone; root metrics remain the
      // browser/user's choice. Put scalable document text on body instead.
      if (decl.parent.selectors.some(selector => ROOT.test(selector.trim()))) return;
      if (decl.prop === 'font-size') {
        decl.value = scaled(decl.value);
        return;
      }
      for (const token of tokens(decl.value)) {
        // var() in a shorthand can be weight, size, family, or the entire font.
        // Only explicit size expressions can be rewritten without guessing.
        if (token.value.startsWith('var(')) return;
        if (SIZE.test(token.value) || /^(?:[\d.]+(?:em|%)|(?:xx?-)?small|medium|(?:xx?-)?large|smaller|larger)$/i.test(token.value)) {
          const size = scaled(token.value);
          decl.value = decl.value.slice(0, token.start) + size + decl.value.slice(token.end);
          return;
        }
      }
    },
  };
}
