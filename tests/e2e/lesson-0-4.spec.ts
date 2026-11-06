import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/0-4/';

test('both graphs draw, in LTR', async ({ page }) => {
  await page.goto(LESSON);
  const canvases = page.locator('.sim-stage canvas');
  await expect(canvases).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const c = canvases.nth(i);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(c)).toBeGreaterThan(200);
  }
});

test('a ruler laid along the spring data matches the best-fit line and ticks the task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-4a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('m/N');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const task = fig.locator('.sim-tasks li').first();
  await expect(task).not.toHaveClass(/done/);
  const canvas = fig.locator('canvas');
  await canvas.focus();
  // spring axes run to 6 N and 0.25 m; the best line is L ≈ 0.119 m + 0.0202 m/N · F.
  // Handle 1 from (0.12, 0.30) to (0.12, 0.54) of the plot, handle 2 from (0.88, 0.62) to (0.88, 0.90).
  for (let i = 0; i < 4; i++) await canvas.press('Shift+ArrowUp');
  for (let i = 0; i < 4; i++) await canvas.press('ArrowUp');
  await canvas.press(' ');
  for (let i = 0; i < 5; i++) await canvas.press('Shift+ArrowUp');
  for (let i = 0; i < 3; i++) await canvas.press('ArrowUp');
  await expect(task).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-4a:ruler-slope']).toBeTruthy();
});

test('reading the text steps never solves the linearization task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-4b');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  // a clicked step applies its state to the figure, as one reaching mid-screen does
  for (const id of ['curve', 'forced-line', 't2', 'g', 'spring-straight']) {
    await page.locator(`.step[data-step="${id}"]`).click();
  }
  await expect(fig.locator('.sim-readout')).toContainText('קפיץ');
  await expect(fig.locator('.sim-tasks li').first()).not.toHaveClass(/done/);
});

test('linearizing the fall: only d against t² ticks the task, and the slope has units of acceleration', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-4b');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toBeVisible();
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const task = fig.locator('.sim-tasks li').first();
  for (const wrong of ['√t', '1/t']) {
    await fig.getByRole('button', { name: wrong, exact: true }).click();
    await expect(task).not.toHaveClass(/done/);
  }
  // the spring is already straight against F: switching to it must not tick the fall task
  await fig.getByRole('button', { name: 'קפיץ', exact: true }).click();
  await expect(task).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'נפילה חופשית', exact: true }).click();
  await fig.getByRole('button', { name: 't²', exact: true }).click();
  await expect(task).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'קו מגמה' }).click();
  await expect(fig.locator('.sim-readout')).toContainText('m/s²');
  await expect(fig.locator('.sim-readout')).toContainText('4.96');
  expect((await progress(page)).tasks['fig-0-4b:linearize-fall']).toBeTruthy();
});

test('g from a graph with the axes reversed: doubling the slope, as for d against t², gets its own feedback', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.4-g-reversed"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('0.408');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('הצירים הפוכים');
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('9.8');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});

test('the measurement tables in the text are the data the figures plot', async ({ page }) => {
  await page.goto(LESSON);
  const tables = page.locator('table.lab-table');
  await expect(tables).toHaveCount(2);
  // DATASETS.spring L at F = 3 N and DATASETS.fall t at d = 1.6 m, both quoted in the text
  await expect(tables.nth(0)).toContainText('0.181');
  await expect(tables.nth(1)).toContainText('0.566');
  await expect(tables.nth(0).locator('.katex')).toHaveCount(2);
});

test('reading the spring line: assuming direct proportion gets its own feedback', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.4-read-value"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('8.4');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('כאילו הקו עובר בראשית');
});
