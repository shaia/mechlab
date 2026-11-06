import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/0-3/';

test('both figures draw, in LTR physics space', async ({ page }) => {
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

test('a scale change moves the drawn angle but not the slope, and only the learner ticks the task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-3a');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('Δd/Δt');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  await expect(readout).toContainText('Δd/Δt = 2 m/s');
  await expect(readout).toContainText('4 m');
  await expect(readout).toContainText('45°');
  await expect(fig.locator('.sim-tasks li').nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: '8 m' }).click();
  await expect(readout).toContainText('Δd/Δt = 2 m/s');
  await expect(readout).toContainText('14°');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-3a:rescale']).toBeTruthy();
});

test('moving the first point to the origin makes a direct proportion', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-3a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('Δd/Δt');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const canvas = fig.locator('canvas');
  await canvas.focus();
  // the first point starts at (0 s, 4 m); four steps down bring it to the origin
  for (let i = 0; i < 4; i++) await canvas.press('ArrowDown');
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('Δd/Δt = 2.8 m/s');
  await expect(readout).toContainText('הקו עובר בראשית');
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-3a:through-origin']).toBeTruthy();
});

test('a line that falls to the right has a negative slope: the car approaches the sign', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-3a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('Δd/Δt');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const canvas = fig.locator('canvas');
  await canvas.focus();
  // the first point starts at (0 s, 4 m); eleven steps up bring it to (0 s, 15 m), above the second point (5 s, 14 m)
  for (let i = 0; i < 11; i++) await canvas.press('ArrowUp');
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('Δd/Δt = −0.2 m/s');
  await expect(fig.locator('.sim-tasks li').nth(2)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-3a:negative-slope']).toBeTruthy();
});

test('the ramp: sin 30° is one half, and sin 60° is not one', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-3b');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('sin θ');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  await expect(readout).toContainText('sin θ = h/L = 0.5');
  // the reset state is not the learner's doing: no task ticks yet
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  const angle = fig.locator('input[type=range]').first();
  const set = (v: string) =>
    angle.evaluate((el: HTMLInputElement, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  await set('31');
  await set('30');
  await expect(fig.locator('.sim-tasks li').nth(0)).toHaveClass(/done/);
  await set('60');
  await expect(readout).toContainText('sin θ = h/L = 0.866');
  await expect(fig.locator('.sim-tasks li').nth(1)).toHaveClass(/done/);
  const length = fig.locator('input[type=range]').nth(1);
  await length.evaluate((el: HTMLInputElement) => {
    el.value = '8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(readout).toContainText('sin θ = h/L = 0.866');
  await expect(fig.locator('.sim-tasks li').nth(2)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-0-3b:same-angle-longer']).toBeTruthy();
});

test('a radians answer to the ladder question gets its own feedback', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.3-ladder-height"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('-1.52');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('רדיאנים');
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('4.33');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
