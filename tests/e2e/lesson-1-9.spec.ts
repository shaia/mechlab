import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-9/';

/** Bring a VectorLab figure into view, wait for it to hydrate, stop the text steps, and reset it. */
async function ready(page: import('@playwright/test').Page, id: string) {
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  const canvases = page.locator('.sim-stage canvas');
  await expect(canvases).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const c = canvases.nth(i);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  }
});

test('a (3, 4) m displacement has magnitude 5 m, not 3 + 4, and the tasks tick', async ({ page }) => {
  await page.goto(LESSON);
  const fig = await ready(page, 'fig-1-9a');
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('A = (2, 3) m');
  await fig.getByRole('button', { name: /רכיבים של A/ }).click();
  const canvas = fig.locator('canvas');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('ArrowUp');
  await expect(readout).toContainText('A = (3, 4) m');
  await expect(readout).toContainText('|A| = 5 m');
  await expect(readout).toContainText('θ = 53°');
  await expect(readout).toContainText('Aₓ + A_y = 7 m ≠ |A| = 5 m');
  const p = await progress(page);
  expect(p.tasks['fig-1-9a:make-3-4']).toBeTruthy();
  expect(p.tasks['fig-1-9a:components-sum']).toBeTruthy();
});

test('an arrow pointing left: acute angle from the x axis, and the sign of Aₓ read off the drawing', async ({ page }) => {
  await page.goto(LESSON);
  const fig = await ready(page, 'fig-1-9a');
  const readout = fig.locator('.sim-readout');
  await fig.getByRole('button', { name: /רכיבים של A/ }).click();
  const canvas = fig.locator('canvas');
  await canvas.focus();
  for (let i = 0; i < 4; i++) await canvas.press('ArrowLeft'); // A = (−2, 3)
  await canvas.press('ArrowUp'); // A = (−2, 4)
  await expect(readout).toContainText('A = (−2, 4) m');
  // never an obtuse angle or a cosine of one: θ is the acute angle (63°), the minus comes from the drawing
  await expect(readout).toContainText('θ = 63°');
  await expect(readout).toContainText('שמאלה ולמעלה');
  await expect(readout).toContainText('Aₓ = −|A| cos θ = −2 m');
  await expect(readout).toContainText('A_y = |A| sin θ = 4 m');
});

test('3 m east plus 4 m north sum to 5 m (the prediction), and the perpendicular task ticks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = await ready(page, 'fig-1-9b');
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('A = (3, 1) m');
  const canvas = fig.locator('canvas');
  await canvas.focus();
  await canvas.press('ArrowDown'); // A = (3, 0); an arrow key selects A
  await canvas.press(' '); // selects B
  await canvas.press('ArrowLeft'); // B = (0, 2)
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp'); // B = (0, 4)
  await expect(readout).toContainText('B = (0, 4) m');
  await expect(readout).toContainText('|A+B| = 5 m');
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-9b:perpendicular']).toBeTruthy();
});

test('the velocity figure names its arrows as the text does, and the car-faster task ticks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = await ready(page, 'fig-1-9c');
  const readout = fig.locator('.sim-readout');
  // the boat: v_S = v_SM + v_M (subscripts are <sub>, so the text reads vSM)
  await expect(readout).toContainText('vSM = (0, 4) m/s');
  await expect(readout).toContainText('vM = (3, 0) m/s');
  await expect(readout).toContainText('vS = (3, 4) m/s');
  await expect(readout).toContainText('|vS| = 5 m/s');
  // rain falling straight down, the difference on, then the car speeds up
  const canvas = fig.locator('canvas');
  await canvas.focus();
  for (let i = 0; i < 8; i++) await canvas.press('ArrowDown'); // A = (0, −4)
  await fig.getByRole('button', { name: /ההפרש/ }).click();
  await canvas.press(' '); // selects B
  await canvas.press('ArrowRight'); // B = (4, 0)
  await expect(readout).toContainText('= (−4, −4) m/s');
  await expect(fig.locator('.sim-tasks li').first()).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-9c:car-faster']).toBeTruthy();
});

test('−2v points opposite to v on the rose', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-1.9-minus-v"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'למעלה', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-wrong/);
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'למטה', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
