import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';

const component = readFileSync(new URL('../src/components/OpeningWordmark.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/home-opening.css', import.meta.url), 'utf8');
const tokens = JSON.parse(readFileSync(new URL('../../../design/tokens.json', import.meta.url), 'utf8')).color.dark;
const asset = readFileSync(new URL('../../../assets/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg', import.meta.url));

function fillFor(className) {
  const match = css.match(new RegExp(`\\.${className}\\s*\\{\\s*fill:\\s*var\\(--ds-(\\w+)\\)`));
  assert.ok(match && tokens[match[1]], `${className} must use a known semantic colour`);
  return tokens[match[1]];
}

async function frame(position, { removeExposure = false } = {}) {
  let svg = component.match(/<svg class="wordmark-scene"[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg, 'The actual opening component supplies the scene');
  svg = svg.replace('<svg class="wordmark-scene"', '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="166" class="wordmark-scene"');
  svg = svg.replace('/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg', `data:image/svg+xml;base64,${asset.toString('base64')}`);
  svg = svg.replace(/\s(data-[\w-]+)(?=[ >])/g, ' $1=""');
  svg = svg.replaceAll('data-light-position=""', `data-light-position="" transform="translate(${position} 0)"`);
  svg = svg.replaceAll('var(--ds-text)', tokens.text).replaceAll('var(--light-ivory)', tokens.text).replaceAll('var(--light-gold)', tokens.accent);
  svg = svg.replace('<defs>', `<style>.wordmark-dark{fill:${fillFor('wordmark-dark')}}.wordmark-settled{fill:${fillFor('wordmark-settled')}}.wordmark-optics{visibility:hidden}</style><defs>`);
  if (removeExposure) svg = svg.replace('class="wordmark-reveal" mask="url(#wordmark-exposure)"', 'class="wordmark-reveal"');
  const image = await sharp(Buffer.from(svg)).flatten({ background: tokens.canvas }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = 0;
  let right = 0;
  for (let y = 0; y < image.info.height; y++) {
    for (let x = 0; x < image.info.width; x++) {
      const i = (y * image.info.width + x) * image.info.channels;
      if (image.data[i] > 180 && image.data[i + 1] > 180 && image.data[i + 2] > 180) {
        if (x < image.info.width / 2) left++;
        else right++;
      }
    }
  }
  return { left, right };
}

function assertProgressive(before, middle, after) {
  assert.ok(after.left > 100 && after.right > 100, 'Both halves of the approved wordmark are visible after the sweep');
  assert.ok(before.left + before.right < (after.left + after.right) * .02, 'The wordmark is not exposed before the sweep');
  assert.ok(middle.left > after.left * .3, 'The left side has been exposed at the midpoint');
  assert.ok(middle.right < after.right * .12, 'The unswept right side remains hidden at the midpoint');
}

test('the actual SVG masks reveal the approved outlines as the light travels', async () => {
  const [before, middle, after] = await Promise.all([-70, 500, 1070].map(position => frame(position)));
  assertProgressive(before, middle, after);
  const unmasked = await frame(-70, { removeExposure: true });
  assert.throws(() => assertProgressive(unmasked, middle, after), /not exposed before the sweep/);
});
