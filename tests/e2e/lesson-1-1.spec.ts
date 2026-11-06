import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-1/';
const FIG = 'fig-1-1a';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Open the lesson with the figure hydrated, steps frozen and the figure reset to its props. */
async function openFigure(page: Page): Promise<Locator> {
  await page.goto(LESSON);
  const fig = page.locator(`#${FIG}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  await hydrated(fig.locator('.sim'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/** The figure's only slider is the time t (the walk preset has no parameter sliders). */
const setTime = (fig: Locator, t: number) =>
  fig
    .locator('input[type=range]')
    .first()
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, t);

const readout = async (fig: Locator) => (await fig.locator('.sim-readout').innerText()).replace(/\s+/g, ' ');

test('the walker draws on an LTR track, lists three tasks, and shows no velocity before it is defined', async ({ page }) => {
  const fig = await openFigure(page);
  const canvas = fig.locator('.sim-stage canvas');
  await expect(canvas).toHaveCSS('direction', 'ltr');
  await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  await expect(fig.locator('.sim-tasks li')).toHaveCount(3);
  const r = await readout(fig);
  expect(r).toContain('x = 1 m');
  expect(r).not.toMatch(/v = |a = /);
  // counters on: displacement and path appear, but not the averages (velocities come in 1.3)
  await fig.getByRole('button', { name: 'העתק ודרך' }).click();
  await setTime(fig, 3);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = +6 m');
  expect(await readout(fig)).not.toContain('Δx/t');
});

test('moving the origin changes x but not Δx, and ticks move-origin', async ({ page }) => {
  const fig = await openFigure(page);
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'העתק ודרך' }).click();
  await setTime(fig, 3);
  await expect(fig.locator('.sim-readout')).toContainText('x = 7 m');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הזיזו את הראשית ימינה' }).click();
  await expect(fig.locator('.sim-readout')).toContainText('x = 6 m');
  await expect(fig.locator('.sim-readout')).toContainText('Δx = +6 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  expect((await progress(page)).tasks[`${FIG}:move-origin`]).toBeTruthy();
});

test('reversing the positive direction flips x and Δx but not the path, and ticks flip-axis', async ({ page }) => {
  const fig = await openFigure(page);
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'העתק ודרך' }).click();
  await setTime(fig, 3);
  await fig.getByRole('button', { name: /הפכו את הכיוון החיובי/ }).click();
  await expect(fig.locator('.sim-readout')).toContainText(/x = [−-]7 m/);
  await expect(fig.locator('.sim-readout')).toContainText(/Δx = [−-]6 m/);
  expect(await readout(fig)).toMatch(/דרך: 6 m/);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks[`${FIG}:flip-axis`]).toBeTruthy();
});

test('at t = 6 s the displacement is zero while the path is 12 m (resolves the prediction), ticking zero-displacement', async ({ page }) => {
  const fig = await openFigure(page);
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'העתק ודרך' }).click();
  await setTime(fig, 2);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await setTime(fig, 6);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = 0 m');
  expect(await readout(fig)).toMatch(/דרך: 12 m/);
  await expect(tasks.nth(2)).toHaveClass(/done/);
  // the end of the walk: Δx = +2 m, path 14 m
  await setTime(fig, 10);
  await expect(fig.locator('.sim-readout')).toContainText('Δx = +2 m');
  expect(await readout(fig)).toMatch(/דרך: 14 m/);
  expect((await progress(page)).tasks[`${FIG}:zero-displacement`]).toBeTruthy();
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator(`#${FIG}`);
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  // these steps set t = 5 s (zero displacement) and move the origin: states that would satisfy tasks
  for (const id of ['path-zero', 'dx-origin']) {
    const step = page.locator(`[data-step="${id}"]`);
    await step.scrollIntoViewIfNeeded();
    await step.click();
  }
  await expect(fig.locator('.sim-readout')).toContainText('Δx');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  const t = (await progress(page))?.tasks ?? {};
  expect(t[`${FIG}:zero-displacement`]).toBeFalsy();
  expect(t[`${FIG}:move-origin`]).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-1"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-1'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: the end position given as the displacement is caught as a misconception; −90 is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.1-dx-back"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('30');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('המקום הסופי');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.1-dx-back', correct: false, misconception: 'MC-position-equals-displacement', lesson: '1.1' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('-90');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('two-tier: "the run-watch path is the displacement" is recorded as MC-distance-equals-displacement', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.1-run-app"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: '80' }).click();
    await q.locator('.reasons label', { hasText: 'כמו ששעון הריצה סופר' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.1-run-app', correct: false, misconception: 'MC-distance-equals-displacement' });
  });
});
