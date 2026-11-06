import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-6/';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Open the lesson with one figure hydrated, steps frozen and the figure reset to its props. */
async function openFigure(page: Page, id: string): Promise<Locator> {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  await hydrated(fig.locator('.sim'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/**
 * Sliders in order: 0 = time t, then the preset's sliders
 * (constant-acceleration: 1 = x0, 2 = v0, 3 = a; brake-to-stop: 1 = v0, 2 = a).
 */
const setSlider = (fig: Locator, nth: number, value: number) =>
  fig
    .locator('input[type=range]')
    .nth(nth)
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

const readout = (fig: Locator) => fig.locator('.sim-readout');

test('both figures draw in an LTR stage, with their tasks listed', async ({ page }) => {
  await page.goto(LESSON);
  for (const [id, n] of [
    ['fig-1-6a', 2],
    ['fig-1-6b', 1],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(n);
  }
});

test('the fan cart speeds up with negative v and negative a, which resolves the prediction and ticks both tasks', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-6a');
  const tasks = fig.locator('.sim-tasks li');
  // defaults: x0 = 0, v0 = +4 m/s, a = −2 m/s²
  await expect(readout(fig)).toContainText('v = +4 m/s');
  await expect(readout(fig)).toContainText('a = −2 m/s²');
  await expect(tasks.filter({ hasText: 'מחליף כיוון' })).not.toHaveClass(/done/);
  // the turn: v = 0 at t = 2 s, x = 4 m, and a is still −2
  await setSlider(fig, 0, 2);
  await expect(readout(fig)).toContainText('v = 0 m/s');
  await expect(readout(fig)).toContainText('x = 4 m');
  await expect(readout(fig)).toContainText('a = −2 m/s²');
  await expect(tasks.filter({ hasText: 'מחליף כיוון' })).toHaveClass(/done/);
  await expect(tasks.filter({ hasText: 'שלילית' })).not.toHaveClass(/done/);
  // after the turn the speed grows: −2, −4, −6 m/s
  await setSlider(fig, 0, 3);
  await expect(readout(fig)).toContainText('v = −2 m/s');
  await expect(tasks.filter({ hasText: 'שלילית' })).toHaveClass(/done/);
  await setSlider(fig, 0, 5);
  await expect(readout(fig)).toContainText('v = −6 m/s');
  await expect(readout(fig)).toContainText('x = −5 m');
  const t = (await progress(page)).tasks;
  expect(t['fig-1-6a:find-turn']).toBeTruthy();
  expect(t['fig-1-6a:speed-up-negative']).toBeTruthy();
});

test('braking distance grows as the square of the speed, and a learner can stop the car at the 40 m line', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-6b');
  const task = fig.locator('.sim-tasks li').first();
  // defaults v0 = 16, a = −4: stops after 4 s at 32 m (time axis 5 s)
  await setSlider(fig, 0, 5);
  await expect(readout(fig)).toContainText('x = 32 m');
  await expect(readout(fig)).toContainText('v = 0 m/s');
  await expect(task).not.toHaveClass(/done/);
  // 10 m/s → 12.5 m; 20 m/s → 50 m: four times, not twice
  await setSlider(fig, 1, 10);
  await setSlider(fig, 0, 4);
  await expect(readout(fig)).toContainText('x = 12.5 m');
  await setSlider(fig, 1, 20);
  await setSlider(fig, 0, 6);
  await expect(readout(fig)).toContainText('x = 50 m');
  await expect(task).not.toHaveClass(/done/);
  // 20 m/s with a = −5 m/s²: 400 / 10 = 40 m, on the line
  await setSlider(fig, 2, -5);
  await setSlider(fig, 0, 5);
  await expect(readout(fig)).toContainText('x = 40 m');
  await expect(task).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-6b:stop-at-line']).toBeTruthy();
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-6a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  // this step moves the cursor to t = 4 s, where v < 0 and a < 0: it would satisfy speed-up-negative
  const step = page.locator('[data-step="speeding-negative"]');
  // centre the step: the observer drives the figure from the step at mid-screen, and the next (t = 0) step is short
  await step.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await step.click();
  await expect(readout(fig)).toContainText('v = −4 m/s');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  expect((await progress(page))?.tasks?.['fig-1-6a:speed-up-negative']).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-6"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-6'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: v₀²/|a| without the 2 is caught, 62.5 m is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.6-braking-distance"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('125');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שכחתם את ה-2');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.6-braking-distance', correct: false, lesson: '1.6' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('62.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('mc: "negative acceleration means braking" is recorded as MC-negative-accel-slows', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.6-neg-neg"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('label.q-choice', { hasText: 'כי התאוצה שלילית' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.6-neg-neg', misconception: 'MC-negative-accel-slows' });
  });
});
