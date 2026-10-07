import { expect, test } from 'bun:test';
import { preprocessCSS, resolveConfig } from 'vite';
import { typeScale } from './type-scale.mjs';

async function compile(css: string) {
  const config = await resolveConfig({ configFile:false, css:{postcss:{plugins:[typeScale()]}} }, 'build');
  return (await preprocessCSS(css, '/type-scale-fixture.css', config)).code;
}

test('compiled utilities and owned responsive font sizes consume the live scale', async()=>{
 const css=await compile('.text{font-size:var(--text-2xl)}.owned{font-size:clamp(2rem,4vw,5rem)}.label{font-size:11px}.container{width:64rem;padding:1rem;gap:2rem}');
 expect(css).toContain('font-size:calc(var(--text-2xl) * var(--type-scale, 1))');
 expect(css).toContain('font-size:calc(clamp(2rem,4vw,5rem) * var(--type-scale, 1))');
 expect(css).toContain('font-size:calc(11px * var(--type-scale, 1))');
 expect(css).toContain('width:64rem;padding:1rem;gap:2rem');
});

test('font shorthand scales only size, retaining line height, weight and family',async()=>{
 const css=await compile('.a{font:500 .68rem/1.8 var(--font-mono)}.b{font:400 clamp(4.5rem,12cqi,8rem)/.85 var(--font-heading,var(--font-sans))}');
 expect(css).toContain('font:500 calc(.68rem * var(--type-scale, 1))/1.8 var(--font-mono)');
 expect(css).toContain('font:400 calc(clamp(4.5rem,12cqi,8rem) * var(--type-scale, 1))/.85 var(--font-heading,var(--font-sans))');
});

test('inheritance, relative text, root metrics and already scaled declarations are not multiplied twice',async()=>{
 const css='html,:host{font-size:100%}:root{font-size:16px}.a{font-size:1.5em}.b{font-size:85%}.c{font:inherit}.d{font-size:calc(2rem * var(--type-scale, 1))}.e{font-size:inherit}';
 expect(await compile(css)).toBe(css);
 const once=await compile('.p{font-size:1rem}.nested{font-size:1.5em}');
 expect(await compile(once)).toBe(once);
});


test('shorthand inheritance and non-font declarations remain valid', async () => {
  const css = '.a{font:italic 700 1.5em/1.4 "Display Serif",serif}.b{font:var(--font)}.c{font:caption}.d{font-size-adjust:.5;line-height:1.5;letter-spacing:.1em}.e{font-size:calc(1em + 2px)}';
  expect(await compile(css)).toBe(css);
  expect(await compile('.a{font:italic 700 12px / 1.4 "Display Serif",serif}')).toContain('font:italic 700 calc(12px * var(--type-scale, 1)) / 1.4 "Display Serif",serif');
});
