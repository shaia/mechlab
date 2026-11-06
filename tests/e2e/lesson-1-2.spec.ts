import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-2/';

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

/** Every figure in this lesson shows only the time slider (sliders: []). */
const setTime = (fig: Locator, t: number) =>
  fig
    .locator('input[type=range]')
    .first()
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, t);

const readout = async (fig: Locator) => (await fig.locator('.sim-readout').innerText()).replace(/\s+/g, ' ');

test('the three figures draw in an LTR stage, with their tasks listed', async ({ page }) => {
  await page.goto(LESSON);
  for (const [id, tasks] of [
    ['fig-1-2a', 2],
    ['fig-1-2b', 2],
    ['fig-1-2c', 0],
  ] as const) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(tasks);
  }
});

test('before velocity is defined (1.3) the readouts show position only', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2a');
  const text = await readout(fig);
  expect(text).toContain('x = 1 m');
  expect(text).not.toContain('m/s');
  // no velocity or acceleration slider either: the time slider is the only one
  await expect(fig.locator('input[type=range]')).toHaveCount(1);
});

test('the walker: scrubbing to a rest ticks find-rest, scrubbing to the turn ticks find-turn', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2a');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  // the table of the lesson: x(4) = 4 m on the way back, x(8) = 2 m walking right; neither is a rest or a turn
  await setTime(fig, 4);
  await expect(fig.locator('.sim-readout')).toContainText('x = 4 m');
  await setTime(fig, 8);
  await expect(fig.locator('.sim-readout')).toContainText('x = 2 m');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setTime(fig, 3);
  await expect(fig.locator('.sim-readout')).toContainText('x = 7 m');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await setTime(fig, 6);
  await expect(fig.locator('.sim-readout')).toContainText('x = 1 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  const t = (await progress(page)).tasks;
  expect(t['fig-1-2a:find-rest']).toBeTruthy();
  expect(t['fig-1-2a:find-turn']).toBeTruthy();
});

test('the walker reverses across the rest 5–7 s: its last moment, t = 7 s, counts as a turn', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2a');
  const turn = fig.locator('.sim-tasks li').nth(1);
  await setTime(fig, 7.5);
  await expect(fig.locator('.sim-readout')).toContainText('x = 1.5 m');
  await expect(turn).not.toHaveClass(/done/);
  await setTime(fig, 7);
  await expect(fig.locator('.sim-readout')).toContainText('x = 1 m');
  await expect(turn).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-2a:find-turn']).toBeTruthy();
});

test('the cart x = 8t − t²: the table values, the turn at the top and the return to the start (resolves the prediction)', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2b');
  const tasks = fig.locator('.sim-tasks li');
  await setTime(fig, 3);
  await expect(fig.locator('.sim-readout')).toContainText('x = 15 m');
  await setTime(fig, 2.5);
  await expect(fig.locator('.sim-readout')).toContainText('x = 13.8 m');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await setTime(fig, 4);
  await expect(fig.locator('.sim-readout')).toContainText('x = 16 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setTime(fig, 8);
  await expect(fig.locator('.sim-readout')).toContainText('x = 0');
  await expect(tasks.nth(1)).toHaveClass(/done/);
});

test('two bodies on one graph: at t = 6 s both are at 24 m', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2c');
  await setTime(fig, 3);
  let text = await readout(fig);
  expect(text).toContain('xA = 12 m');
  expect(text).toContain('xB = 30 m');
  await setTime(fig, 6);
  await expect(fig.locator('.sim-readout')).toContainText('xA = 24 m');
  text = await readout(fig);
  expect(text).toContain('xB = 24 m');
  expect(text).not.toContain('m/s');
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  for (const [fig, steps] of [
    ['fig-1-2a', ['read-graph', 'diagram-read']],
    ['fig-1-2b', ['turn', 'not-path']],
  ] as const) {
    const f = page.locator(`#${fig}`);
    await f.scrollIntoViewIfNeeded();
    await hydrated(f.locator('.sim'));
    // these steps put the cursor at a rest (t = 6 s, t = 10 s), at the turn (t = 4 s) and at the return (t = 8 s)
    for (const id of steps) {
      const step = page.locator(`[data-step="${id}"]`);
      await step.scrollIntoViewIfNeeded();
      await step.click();
    }
    await expect(f.locator('.sim-readout')).toContainText('x');
    await expect(f.locator('.sim-tasks li.done')).toHaveCount(0);
  }
  const t = (await progress(page))?.tasks ?? {};
  expect(t['fig-1-2a:find-rest']).toBeFalsy();
  expect(t['fig-1-2b:find-turn']).toBeFalsy();
  expect(t['fig-1-2b:zero-displacement']).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-2"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-2'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: forgetting the start position is caught as a misconception, 11 m is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.2-swimmer-table"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('המקום ההתחלתי');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.2-swimmer-table', correct: false, misconception: 'MC-position-equals-displacement', lesson: '1.2' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('11');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('two-tier: "the graph is the shape of the road" is recorded as MC-graph-is-path', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.2-graph-is-path"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'צורת הגרף היא צורת הכביש' }).click();
    await q.locator('.reasons label', { hasText: 'צורת הדרך' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.2-graph-is-path', misconception: 'MC-graph-is-path' });
  });
});
