import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-3/';

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

/** Range inputs in MotionTrack's order: 0 = time, then the preset's sliders (x0, v0, x02, v2). */
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
  for (const [id, n] of [
    ['fig-1-3a', 2],
    ['fig-1-3b', 1],
    ['fig-1-3c', 1],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(n);
  }
});

test('x = x0 + v·t: a start at 3 m with 1 m/s passes the target (6 s, 9 m); a negative velocity ticks its task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-3a');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await setSlider(fig, 1, 3); // x0 = 3 m, v0 stays at the preset's 1 m/s
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await setSlider(fig, 0, 6);
  expect(await readout(fig)).toContain('x = 9 m');
  expect(await readout(fig)).toContain('v = +1 m/s');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setSlider(fig, 2, -1.5);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // 3 − 1.5·6 = −6 m
  await expect(fig.locator('.sim-readout')).toContainText('x = −6 m');
  const t = (await progress(page)).tasks;
  expect(t['fig-1-3a:set-velocity']).toBeTruthy();
  expect(t['fig-1-3a:negative-velocity']).toBeTruthy();
});

test('the prediction pair: A (0 m, 3 m/s) is lower but faster, and meets B (10 m, 1 m/s) at 5 s, 15 m', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-3b');
  const task = fig.locator('.sim-tasks li').nth(0);
  // the preset's start (A 0 m at 2 m/s, B 40 m at 1 m/s) meets only at 40 s
  await expect(task).not.toHaveClass(/done/);
  await setSlider(fig, 2, 3); // vA
  await setSlider(fig, 3, 10); // xB
  await expect(task).toHaveClass(/done/);
  await setSlider(fig, 0, 4);
  expect(await readout(fig)).toContain('xA = 12 m');
  expect(await readout(fig)).toContain('xB = 14 m');
  await setSlider(fig, 0, 5);
  expect(await readout(fig)).toContain('xA = 15 m');
  expect(await readout(fig)).toContain('xB = 15 m');
  expect((await progress(page)).tasks['fig-1-3b:make-them-meet']).toBeTruthy();
});

test('stop-and-go: at 7 s the average velocity is 16/7, at 11 s displacement 4 m against a path of 28 m', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-3c');
  await setSlider(fig, 0, 7);
  await expect(fig.locator('.sim-readout')).toContainText('Δx/Δt = +2.29 m/s');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/); // the turn is at 7 s
  await setSlider(fig, 0, 11);
  const r = await readout(fig);
  expect(r).toContain('Δx = +4 m');
  expect(r).toContain('דרך: 28 m');
  expect(r).toContain('Δx/Δt = +0.364 m/s');
  expect(r).toContain('2.55 m/s');
  expect((await progress(page)).tasks['fig-1-3c:find-turn']).toBeTruthy();
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  // the sign step sets v0 = −2 m/s (negative-velocity); the higher-line step sets two bodies that meet at 5 s
  for (const [fig, step] of [
    ['fig-1-3a', 'sign'],
    ['fig-1-3b', 'higher-line'],
  ]) {
    const f = page.locator(`#${fig}`);
    await f.scrollIntoViewIfNeeded();
    await hydrated(f.locator('.sim'));
    const s = page.locator(`[data-step="${step}"]`);
    await s.scrollIntoViewIfNeeded();
    await s.click();
    await expect(f.locator('.sim-readout')).toContainText('m/s');
  }
  await expect(page.locator('#fig-1-3a .sim-readout')).toContainText('v = −2 m/s');
  await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
  const t = (await progress(page))?.tasks ?? {};
  expect(t['fig-1-3a:negative-velocity']).toBeFalsy();
  expect(t['fig-1-3b:make-them-meet']).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-3"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-3'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: the mean of the two speeds is caught as MC-average-of-speeds, 16 km/h is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.3-two-legs-average"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('18');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('הממוצע של 12 ו-24');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.3-two-legs-average', correct: false, misconception: 'MC-average-of-speeds', lesson: '1.3' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('16');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('two-tier: "the higher line is faster" is recorded as MC-higher-graph-faster', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.3-higher-line"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: /^\s*Q\s*$/ }).click();
    await q.locator('.reasons label', { hasText: 'הגובה של הקו' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.3-higher-line', misconception: 'MC-higher-graph-faster' });
  });
});
