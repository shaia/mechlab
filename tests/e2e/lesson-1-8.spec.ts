import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-8/';

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

/** Sliders in order: 0 = time t, 1 = start of the area interval t₁. */
const setSlider = (fig: Locator, nth: number, value: number) =>
  fig
    .locator('input[type=range]')
    .nth(nth)
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

const readout = async (fig: Locator) => (await fig.locator('.sim-readout').innerText()).replace(/\s+/g, ' ');

test('both figures draw in an LTR stage; the first lists its two tasks', async ({ page }) => {
  await page.goto(LESSON);
  for (const [id, n] of [
    ['fig-1-8a', 2],
    ['fig-1-8b', 0],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(n);
  }
});

test('the cart is farthest right when its velocity is zero, at t = 5 s (resolves the prediction)', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-8a');
  await setSlider(fig, 0, 5);
  await expect(fig.locator('.sim-readout')).toContainText('x = 12 m');
  expect(await readout(fig)).toMatch(/v = 0 m\/s/);
  // the area from 0 to 5 s is the displacement, +12 m
  expect(await readout(fig)).toContain('+12 m');
  // at the speed maximum (t = 2.5 s) the cart is only at 6 m
  await setSlider(fig, 0, 2.5);
  await expect(fig.locator('.sim-readout')).toContainText('x = 6 m');
  expect(await readout(fig)).toContain('v = +4 m/s');
});

test('area from t₁ = 2 s to 6 s equals the displacement and ticks area-equals-dx', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-8a');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await setSlider(fig, 1, 2);
  await setSlider(fig, 0, 6);
  // 2 → 3 s: 4 m; 3 → 5 s: 4 m; 5 → 6 s: −1 m  ⇒ +7 m, and Δx = x(6) − x(2) = 11 − 4 = +7 m
  await expect(fig.locator('.sim-readout')).toContainText('Δx = +7 m');
  expect(await readout(fig)).toContain('v–t: +7 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-8a:area-equals-dx']).toBeTruthy();
});

test('from t₁ = 3 s to t = 7 s the net area is zero while the cart moves: net-area-zero ticks', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-8a');
  const tasks = fig.locator('.sim-tasks li');
  await setSlider(fig, 1, 3);
  await setSlider(fig, 0, 7);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = 0 m');
  // the a–t area over the same interval is Δv = −8 m/s
  expect(await readout(fig)).toMatch(/a–t: [−-]8 m\/s/);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-8a:net-area-zero']).toBeTruthy();
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-8a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  // the a–t step sets t₁ = 3 s and t = 7 s: a state that satisfies net-area-zero
  const step = page.locator('[data-step="at-step"]');
  await step.scrollIntoViewIfNeeded();
  await step.click();
  await expect(fig.locator('.sim-readout')).toContainText('Δx = 0 m');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  expect((await progress(page))?.tasks?.['fig-1-8a:net-area-zero']).toBeFalsy();
});

test('stop-and-go: signed area is the displacement (+4 m), unsigned the path (28 m)', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-8b');
  await setSlider(fig, 0, 11);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = +4 m');
  expect(await readout(fig)).toContain('28 m');
  await setSlider(fig, 1, 7);
  await expect(fig.locator('.sim-readout')).toContainText(/v–t: [−-]12 m/);
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-8"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-8'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: the rectangle alone is caught, the triangle plus rectangle is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.8-area-dx"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('12');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('רק את המלבן');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.8-area-dx', correct: false, lesson: '1.8' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('21');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric a–t area: the area alone (Δv = 4) is caught, v₀ + Δv = 5 m/s is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.8-at-area"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('שינוי');
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.8-at-area', correct: false, misconception: 'MC-area-is-position' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('mc: "the area is the position" is recorded as MC-area-is-position', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.8-area-position"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices label', { hasText: 'x = 12' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.8-area-position', misconception: 'MC-area-is-position' });
  });
});
