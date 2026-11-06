import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-4/';

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

/** Sliders in order: 0 = velocity of A, 1 = velocity of B, 2 = time. */
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
  for (const id of ['fig-1-4a', 'fig-1-4b']) {
    const fig = page.locator(`#${id}`);
    await fig.scrollIntoViewIfNeeded();
    const canvas = fig.locator('.sim-stage canvas');
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    await expect(fig.locator('.sim-tasks li')).toHaveCount(2);
  }
});

test('the runners close 24 m at 6 m/s and meet after 4 s, from the ground and from B (resolves the prediction)', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-4a');
  expect(await readout(fig)).toContain('מהירות ההתקרבות: 6 m/s');
  expect(await readout(fig)).toContain('נפגשים בעוד 4 s');
  await fig.getByRole('button', { name: 'B', exact: true }).click();
  await expect(fig.locator('.sim-readout')).toContainText('vAB = −6 m/s');
  // B is the frame: marked as such, never given a "vB = 0" (v_B means relative to the ground)
  await expect(fig.locator('.sim-readout')).toContainText('B עומד: זו מערכת הייחוס');
  expect(await readout(fig)).not.toContain('vB =');
  // the meeting time is the same in B's frame
  expect(await readout(fig)).toContain('נפגשים בעוד 4 s');
  // after 2 s the gap is 24 − 2·6 = 12 m
  await setSlider(fig, 2, 2);
  await expect(fig.locator('.sim-readout')).toContainText('המרחק: 12 m');
});

test("switching to A's frame ticks frame-of-a; a learner's head-on pair ticks closing-speed", async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-4a');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'A', exact: true }).click();
  await expect(fig.locator('.sim-readout')).toContainText('vBA = +6 m/s');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await setSlider(fig, 0, -4);
  await setSlider(fig, 1, 2);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const t = (await progress(page)).tasks;
  expect(t['fig-1-4a:frame-of-a']).toBeTruthy();
  expect(t['fig-1-4a:closing-speed']).toBeTruthy();
});

test('equal velocities keep the gap; a faster B behind A overtakes it, even beyond the time slider', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-4b');
  const tasks = fig.locator('.sim-tasks li');
  await setSlider(fig, 0, 3);
  await setSlider(fig, 1, 3);
  await expect(fig.locator('.sim-readout')).toContainText('המרחק קבוע');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // B starts at −12 m, behind A at +12 m for rightward motion. Both moving left, B is ahead: they separate.
  await setSlider(fig, 0, -2);
  await setSlider(fig, 1, -5);
  await expect(fig.locator('.sim-readout')).toContainText('מתרחקים');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  // both right, B faster: 24 m closed at 1 m/s, a meeting after 24 s, beyond the 10 s slider, still an overtake
  await setSlider(fig, 0, 1);
  await setSlider(fig, 1, 2);
  await expect(fig.locator('.sim-readout')).toContainText('נפגשים בעוד 24 s');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // the lesson's own numbers: 24 m at 3 m/s
  await setSlider(fig, 0, 2);
  await setSlider(fig, 1, 5);
  await expect(fig.locator('.sim-readout')).toContainText('נפגשים בעוד 8 s');
  const t = (await progress(page)).tasks;
  expect(t['fig-1-4b:same-velocity']).toBeTruthy();
  expect(t['fig-1-4b:overtake']).toBeTruthy();
});

test('a text step never ticks a task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-4b');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  // the step with equal velocities and the overtaking step both set states that would satisfy a task
  for (const id of ['same', 'overtake']) {
    const step = page.locator(`[data-step="${id}"]`);
    await step.scrollIntoViewIfNeeded();
    await step.click();
  }
  await expect(fig.locator('.sim-readout')).toContainText('m/s');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  expect((await progress(page))?.tasks?.['fig-1-4b:overtake']).toBeFalsy();
});

test.describe('predict and questions', () => {
  test('the prediction opens its flap and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-4"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await predict.locator('label.q-choice').nth(0).click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-4'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('numeric: subtracting magnitudes is caught as a misconception, the signed answer is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.4-vab-opposite"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בלי סימנים');
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.4-vab-opposite', correct: false, misconception: 'MC-relative-speeds-add', lesson: '1.4' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('20');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('two-tier: "the ground is the true frame" is recorded as MC-velocity-absolute', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.4-train-seat"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.locator('.q-choices').first().locator('label', { hasText: 'תלויה במערכת הייחוס' }).click();
    await q.locator('.reasons label', { hasText: 'מערכת הייחוס האמיתית' }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-wrong/);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.4-train-seat', misconception: 'MC-velocity-absolute' });
  });
});
