import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/0-1/';

// still mode lands every launch at once, so a test never waits out a 3-second flight
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Open the lesson with the launcher hydrated, steps frozen and the figure reset. */
async function openFigure(page: Page): Promise<Locator> {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-1');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  await hydrated(fig.locator('.sim'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const setSlider = (fig: Locator, nth: number, value: number) =>
  fig
    .locator('input[type=range]')
    .nth(nth)
    .evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

const launchAt = async (fig: Locator, angle: number) => {
  await setSlider(fig, 1, angle);
  await expect(fig.locator('.slider output').nth(1)).toHaveText(`${angle}°`);
  await fig.getByRole('button', { name: 'שגרו' }).click();
};

test('the launcher draws in an LTR stage, with its tasks listed', async ({ page }) => {
  const fig = await openFigure(page);
  const canvas = fig.locator('.sim-stage canvas');
  await expect(canvas).toHaveCSS('direction', 'ltr');
  await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  await expect(fig.locator('.sim-tasks li')).toHaveCount(4);
  await expect(fig.locator('.sim-tasks li').first()).toContainText('שגרו את הכדור');
});

test('30° and 60° land at the same point, which resolves the prediction and ticks the comparison task', async ({ page }) => {
  const fig = await openFigure(page);
  await launchAt(fig, 30);
  await expect(fig.locator('.sim-readout')).toContainText('34.6 m');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
  await expect(fig.locator('.sim-tasks li').nth(1)).not.toHaveClass(/done/);
  await launchAt(fig, 60);
  await expect(fig.locator('.sim-readout')).toContainText('34.6 m');
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  const tasks = (await progress(page)).tasks;
  expect(tasks['fig-0-1:launch']).toBeTruthy();
  expect(tasks['fig-0-1:compare-30-60']).toBeTruthy();
});

test('hitting the target at two angles far apart ticks both hit tasks', async ({ page }) => {
  const fig = await openFigure(page);
  await launchAt(fig, 45);
  await expect(fig.locator('.sim-readout')).toContainText('אחרי המטרה');
  await expect(fig.locator('.sim-tasks li').nth(2)).not.toHaveClass(/done/);
  await launchAt(fig, 25);
  await expect(fig.locator('.sim-readout')).toContainText('פגיעה במטרה');
  await expect(fig.locator('.sim-tasks li').nth(2)).toHaveClass(/done/);
  await expect(fig.locator('.sim-tasks li').nth(3)).not.toHaveClass(/done/);
  await launchAt(fig, 65);
  await expect(fig.locator('.sim-tasks li').nth(3)).toHaveClass(/done/);
  expect((await progress(page))?.tasks['fig-0-1:second-angle']).toBeTruthy();
});

test('a text step moves the target and sets the angle, but never ticks a task', async ({ page }) => {
  // the step bus itself is under test here, so steps are not frozen
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-1');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  const canvas = fig.locator('.sim-stage canvas');
  await page.locator('[data-step="resolve"]').click();
  await expect(canvas).toHaveAttribute('aria-label', /במרחק 20 מטר/);
  await expect(canvas).toHaveAttribute('aria-label', /הזווית 60 מעלות/);
  await page.locator('[data-step="steps"]').click();
  await expect(canvas).toHaveAttribute('aria-label', /במרחק 30 מטר/);
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-0-1:'))).toEqual([]);
});

test('scrolling back a little from the aiming task never moves the target or the aim', async ({ page }) => {
  // the step above the hit-the-target task must leave the learner's target, speed and angle alone
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-1');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('.sim'));
  const canvas = fig.locator('.sim-stage canvas');
  const center = (step: string) =>
    page.locator(`[data-step="${step}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await center('aim');
  await expect(page.locator('[data-step="aim"]')).toHaveClass(/is-active/);
  await expect(canvas).toHaveAttribute('aria-label', /במרחק 30 מטר/);
  await setSlider(fig, 1, 25);
  await center('steps');
  await expect(page.locator('[data-step="steps"]')).toHaveClass(/is-active/);
  await expect(canvas).toHaveAttribute('aria-label', /במרחק 30 מטר/);
  await expect(canvas).toHaveAttribute('aria-label', /הזווית 25 מעלות/);
});

test('the prediction is kept, and the summary returns to it', async ({ page }) => {
  await page.goto(LESSON);
  const predict = page.locator('[data-predict-id="pred-0-1"]');
  await predict.scrollIntoViewIfNeeded();
  await hydrated(predict);
  await predict.locator('label.q-choice').nth(2).click();
  await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
  await expect(predict).toHaveClass(/is-open/);
  await page.locator('.revisit').scrollIntoViewIfNeeded();
  await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
});

test('ranking the four confidence outcomes', async ({ page }) => {
  await page.goto(LESSON);
  const r = page.locator('[data-qid="Q-0.1-rank-review"]');
  await r.scrollIntoViewIfNeeded();
  await hydrated(r);
  // starts as right-unsure, wrong-sure, right-sure, wrong-unsure; the answer is
  // wrong-sure, wrong-unsure, right-unsure, right-sure
  const up = r.getByRole('button', { name: 'למעלה' });
  await up.nth(1).click();
  await up.nth(3).click();
  await up.nth(2).click();
  await r.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(r).toHaveClass(/is-right/);
});
