import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-5/';

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
 * Range inputs in MotionTrack's order: 0 = time, 1 = the Δt slider in fig-1-5a: index 0…13 picks
 * 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3 s (DT_STOPS), so Δt grows to the right.
 */
const setSlider = (fig: Locator, nth: number, value: number) =>
  fig
    .locator('input[type=range]')
    .nth(nth)
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

const readout = async (fig: Locator) => (await fig.locator('.sim-readout').innerText()).replace(/\s+/g, ' ');

test('both figures draw in an LTR stage, with their tasks listed', async ({ page }) => {
  await page.goto(LESSON);
  for (const [id, n] of [
    ['fig-1-5a', 1],
    ['fig-1-5b', 2],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(n);
  }
});

test('the chord from 1 s over 2 s has slope 4 m/s; at 4 s it is −0.5 m/s, and shrinking Δt gives +2.5 (resolves the prediction)', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-5a');
  const task = fig.locator('.sim-tasks li').nth(0);
  // props: t = 1 s, Δt = 2 s
  const first = await readout(fig);
  expect(first).toContain('Δt = 2 s, Δx = +8 m, Δx/Δt = +4 m/s');
  // the readout of 1.5א shows t and x only: v would give the lesson's answer away, and a is taught in 1.6
  expect(first).not.toMatch(/(^| )v = /);
  expect(first).not.toMatch(/(^| )a = /);
  await setSlider(fig, 0, 4);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = −1 m, Δx/Δt = −0.5 m/s');
  await expect(task).not.toHaveClass(/done/);
  // the table's Δt values are slider stops; v(4 s) = 2.5 and a = −3, so the chord slope is 2.5 − 1.5·Δt
  await setSlider(fig, 1, 9);
  await expect(fig.locator('.sim-readout')).toContainText('Δt = 1 s, Δx = +1 m, Δx/Δt = +1 m/s');
  await setSlider(fig, 1, 8);
  await expect(fig.locator('.sim-readout')).toContainText('Δt = 0.5 s');
  await expect(fig.locator('.sim-readout')).toContainText('Δx/Δt = +1.75 m/s');
  await setSlider(fig, 1, 6);
  await expect(fig.locator('.sim-readout')).toContainText('Δx/Δt = +2.35 m/s');
  await expect(task).not.toHaveClass(/done/);
  // Δt = 1 ms: the chord slope 2.4985 rounds to 2.5
  await setSlider(fig, 1, 0);
  await expect(fig.locator('.sim-readout')).toContainText('Δx/Δt = +2.5 m/s');
  await expect(task).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-5a:shrink-secant']).toBeTruthy();
  // the tangent chip shows the tangent's slope, the instantaneous velocity
  await fig.getByRole('button', { name: 'משיק' }).click();
  await expect(fig.locator('.sim-readout')).toContainText('משיק: v = +2.5 m/s');
});

test('the Δt slider grows to the right: dragging it left shrinks the chord (the text says "שמאלה")', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-5a');
  const input = fig.locator('input[type=range]').nth(1);
  await expect(input).toHaveAttribute('dir', 'ltr');
  const out = fig.locator('label.slider').nth(1).locator('output');
  await expect(out).toHaveText('2 s');
  // keyboard ArrowLeft lowers the value of an LTR range input: Δt 2 → 1.5 → 1 s
  await input.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(out).toHaveText('1.5 s');
  await page.keyboard.press('ArrowLeft');
  await expect(out).toHaveText('1 s');
  await expect(fig.locator('.sim-readout')).toContainText('Δt = 1 s');
  // the far left is the smallest Δt, the far right the largest
  await page.keyboard.press('Home');
  await expect(out).toHaveText('1·10⁻³ s');
  await page.keyboard.press('End');
  await expect(out).toHaveText('3 s');
  // a pointer at the left end of the track picks the smallest Δt
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 2, box!.y + box!.height / 2);
  await expect(out).toHaveText('1·10⁻³ s');
});

test('figure 1.5ב shows x and v but not a', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-5b');
  const text = await readout(fig);
  expect(text).toMatch(/(^| )v = /);
  expect(text).not.toMatch(/(^| )a = /);
});

test('a step sets Δt = 0.5 s (a slider stop) and the slider shows it; steps tick nothing', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-5a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  const shrink = page.locator('[data-step="shrink"]');
  await shrink.scrollIntoViewIfNeeded();
  await shrink.click();
  await expect(fig.locator('.sim-readout')).toContainText('Δt = 0.5 s');
  await expect(fig.locator('label.slider').nth(1).locator('output')).toHaveText('0.5 s');
  // the step with Δt = 0.01 s and the chord on would satisfy shrink-secant, but a step never ticks a task
  const tangent = page.locator('[data-step="tangent"]');
  await tangent.scrollIntoViewIfNeeded();
  await tangent.click();
  await expect(fig.locator('.sim-readout')).toContainText('Δt = 0.01 s');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);

  const figB = page.locator('#fig-1-5b');
  await figB.scrollIntoViewIfNeeded();
  await hydrated(figB.locator('.sim'));
  for (const id of ['turn', 'fastest']) {
    const step = page.locator(`[data-step="${id}"]`);
    await step.scrollIntoViewIfNeeded();
    await step.click();
  }
  await expect(figB.locator('.sim-readout')).toContainText('v = −6.5 m/s');
  await expect(figB.locator('.sim-tasks li.done')).toHaveCount(0);
  const t = (await progress(page))?.tasks ?? {};
  expect(t['fig-1-5a:shrink-secant']).toBeFalsy();
  expect(t['fig-1-5b:find-fastest']).toBeFalsy();
});

test('the steepest tangent (t = 7 s, v = −6.5 m/s) ticks find-fastest; a flat tangent near 4.83 s ticks tangent-flat', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-5b');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setSlider(fig, 0, 7);
  await expect(fig.locator('.sim-readout')).toContainText('משיק: v = −6.5 m/s');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  // v(4.85 s) = 5.5 − 3·1.85 = −0.05 m/s
  await setSlider(fig, 0, 4.85);
  await expect(fig.locator('.sim-readout')).toContainText('v = −0.05 m/s');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const t = (await progress(page)).tasks;
  expect(t['fig-1-5b:find-fastest']).toBeTruthy();
  expect(t['fig-1-5b:tangent-flat']).toBeTruthy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-5"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-5'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: x/t of the second point is caught as MC-x-over-t, the chord slope is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.5-chord-slope"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הקו מהראשית');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.5-chord-slope', correct: false, misconception: 'MC-x-over-t', lesson: '1.5' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: the longest chord of the table is caught as MC-instantaneous-is-average', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.5-table-limit"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('input[type=text]').fill('7');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.5-table-limit', misconception: 'MC-instantaneous-is-average' });
    // the shortest chord, 6.01, lies outside the 0.1% tolerance: it is wrong, and its own feedback shows
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.locator('input[type=text]').fill('6.01');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    await expect(q.locator('.q-feedback')).toContainText('המיתר הקצר ביותר');
  });
});
