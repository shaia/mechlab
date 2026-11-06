import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-10/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-1-10a', '#fig-1-10b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('shrinking Δt turns the average velocity onto the tangent, and the circle shows a pointing inward', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-10a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);

  // the throw, at t = 0.6 s where the path bends; average velocity on, then Δt to its smallest
  await fig.getByRole('button', { name: 'מהירות ממוצעת', exact: true }).click();
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(0), 0.6);
  await slide(ranges.nth(1), 1);
  await expect(fig.locator('.sim-readout')).toContainText('זווית בין v הממוצעת ל-v');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 0);
  await expect(tasks.nth(0)).toHaveClass(/done/);

  // the circle at constant speed (r = 4 m): |v| = 2 m/s, and once a is shown, |a| = 1 m/s² (planar.ts presetPath)
  await fig.getByRole('button', { name: 'מעגל, גודל מהירות קבוע' }).click();
  await expect(fig.locator('.sim-readout')).toContainText('|v| = 2 m/s');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'תאוצה', exact: true }).click();
  await expect(fig.locator('.sim-readout')).toContainText('|a| = 1 m/s²');
  await expect(tasks.nth(1)).toHaveClass(/done/);

  const p = await progress(page);
  expect(p.tasks['fig-1-10a:shrink-dt']).toBeTruthy();
  expect(p.tasks['fig-1-10a:circle-accel-inward']).toBeTruthy();
});

test('on the slowing curve the tangential part is negative, and moving the body ticks the task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-1-10b');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const task = fig.locator('.sim-tasks li').first();

  await fig.getByRole('button', { name: 'עקום, מאט' }).click();
  await fig.getByRole('button', { name: 'תאוצה', exact: true }).click();
  await fig.getByRole('button', { name: 'פירוק התאוצה', exact: true }).click();
  const readout = fig.locator('.sim-readout');
  // aT = −α·R = −0.3 · 4 = −1.2 m/s² all along this arc (planar.ts, preset curve-slowing-down)
  await expect(readout).toContainText('רכיב משיקי aT: −1.2 m/s²');
  await expect(task).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(0), 1);
  await expect(task).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-1-10b:find-slowing']).toBeTruthy();
});

test('subtracting speeds instead of velocities is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-1.10-dv-numeric"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('1.75');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('חיסרתם גדלים');
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.10-dv-numeric', misconception: 'MC-difference-of-magnitudes', confident: true });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('3.25');
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});

test('"no acceleration on a circle" is caught on the direction rose', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-1.10-circle-accel"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'אפס: אין כיוון' }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-1.10-circle-accel', misconception: 'MC-constant-speed-no-accel' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'למטה', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
