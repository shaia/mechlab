import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-7/';

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

/** Range inputs in order: 0 = time, then the figure's sliders (fig-1-7a: v0; fig-1-7b: m, m2; fig-1-7c: v0, x0). */
const setSlider = (fig: Locator, nth: number, value: number) =>
  fig
    .locator('input[type=range]')
    .nth(nth)
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

const readout = async (fig: Locator) => (await fig.locator('.sim-readout').innerText()).replace(/\s+/g, ' ');

test('the three figures draw in an LTR stage, with their tasks listed', async ({ page }) => {
  await page.goto(LESSON);
  for (const [id, tasks] of [
    ['fig-1-7a', 2],
    ['fig-1-7b', 1],
    ['fig-1-7c', 0],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(tasks);
  }
});

test('at the top of a 15 m/s throw v = 0 and a = −10 (resolves the prediction); pausing there ticks pause-at-top', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-7a');
  const tasks = fig.locator('.sim-tasks li');
  // the readout calls the position y on a vertical track
  expect(await readout(fig)).toContain('y = 0 m');
  await setSlider(fig, 0, 0.5);
  await expect(fig.locator('.sim-readout')).toContainText('v = +10 m/s');
  expect(await readout(fig)).toContain('a = −10 m/s²');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await setSlider(fig, 0, 1.5);
  await expect(fig.locator('.sim-readout')).toContainText('v = 0 m/s');
  expect(await readout(fig)).toContain('a = −10 m/s²');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // on the way down: same acceleration, negative velocity
  await setSlider(fig, 0, 2.5);
  await expect(fig.locator('.sim-readout')).toContainText('v = −10 m/s');
  expect(await readout(fig)).toContain('a = −10 m/s²');
  expect((await progress(page)).tasks['fig-1-7a:pause-at-top']).toBeTruthy();
});

test('a 20 m/s throw peaks at the 20 m line after 2 s and ticks reach-height', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-7a');
  const tasks = fig.locator('.sim-tasks li');
  await setSlider(fig, 1, 18);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setSlider(fig, 1, 20);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await setSlider(fig, 0, 2);
  await expect(fig.locator('.sim-readout')).toContainText('y = 20 m');
  expect(await readout(fig)).toContain('v = 0 m/s');
  // symmetry: back on the ground after 4 s at −20 m/s (just before it comes to rest on the ground)
  await setSlider(fig, 0, 3.95);
  await expect(fig.locator('.sim-readout')).toContainText('v = −19.5 m/s');
  expect((await progress(page)).tasks['fig-1-7a:reach-height']).toBeTruthy();
});

test('two balls of different mass land together after 2 s; a 10:1 mass ratio at landing ticks change-mass', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-7b');
  const task = fig.locator('.sim-tasks li').first();
  await setSlider(fig, 0, 1);
  // t = 1 s: both have fallen 5 m and move at −10 m/s
  await expect(fig.locator('.sim-readout')).toContainText('yA = 15 m');
  expect(await readout(fig)).toContain('yB = 15 m');
  expect(await readout(fig)).toContain('vA = −10 m/s');
  expect(await readout(fig)).toContain('vB = −10 m/s');
  await setSlider(fig, 0, 2.5);
  await expect(fig.locator('.sim-readout')).toContainText('yA = 0 m');
  await expect(task).not.toHaveClass(/done/);
  await setSlider(fig, 1, 10);
  await expect(task).toHaveClass(/done/);
  // the mass changed only the drawing: both balls still landed together
  expect(await readout(fig)).toContain('yA = 0 m');
  expect(await readout(fig)).toContain('yB = 0 m');
  expect((await progress(page)).tasks['fig-1-7b:change-mass']).toBeTruthy();
});

test('a 20 m/s throw from the ground peaks at 20 m; from a 25 m roof it peaks at 45 m after 2 s', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-7c');
  expect(await readout(fig)).toContain('y = 0 m');
  await setSlider(fig, 0, 2);
  await expect(fig.locator('.sim-readout')).toContainText('y = 20 m');
  // the launch-height slider (index 2: time, v0, x0) raises the launch point to the roof
  await setSlider(fig, 2, 25);
  await setSlider(fig, 0, 0);
  await expect(fig.locator('.sim-readout')).toContainText('y = 25 m');
  await setSlider(fig, 0, 2);
  await expect(fig.locator('.sim-readout')).toContainText('y = 45 m');
  expect(await readout(fig)).toContain('v = 0 m/s');
  // 0.05 s before landing at 5 s: v = 20 − 10·4.95
  await setSlider(fig, 0, 4.95);
  await expect(fig.locator('.sim-readout')).toContainText('v = −29.5 m/s');
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-7a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  // "apex" pauses fig-1-7a's ball at its top; "reach" sets fig-1-7c to the 20 m/s throw whose apex is the 20 m line
  for (const id of ['apex', 'reach']) {
    const step = page.locator(`[data-step="${id}"]`);
    await step.scrollIntoViewIfNeeded();
    await step.click();
  }
  await expect(fig.locator('.sim-readout')).toContainText('m/s');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  const t = (await progress(page))?.tasks ?? {};
  expect(t['fig-1-7a:pause-at-top']).toBeFalsy();
  expect(t['fig-1-7a:reach-height']).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-7"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-7'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: a = +g with an upward axis is caught as MC-free-fall-sign, H = 12.8 m is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.7-max-height"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('-12.8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('גובה שלילי');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-1.7-max-height',
      correct: false,
      misconception: 'MC-free-fall-sign',
      lesson: '1.7',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('12.8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('two-tier: "no motion, no acceleration" is recorded as MC-zero-velocity-zero-accel', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.7-top-twotier"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'כלפי מטה' }).click();
    await q.locator('.reasons label', { hasText: 'כשהגוף לא זז' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.7-top-twotier', misconception: 'MC-zero-velocity-zero-accel' });
  });
});
