import { expect, test } from '@playwright/test';
import { freezeSteps, hydrated, progress } from './helpers';

const LESSON = '/lessons/0-2/';

test('the ruler reads 20 ms three ways, then 15 cm, ticking both tasks', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-2a');
  await fig.scrollIntoViewIfNeeded();
  const readout = fig.locator('.sim-readout');
  await expect(readout).toContainText('2.5 ms');
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  const canvas = fig.locator('canvas');
  await expect(canvas).toHaveCSS('direction', 'ltr');
  const tasks = fig.locator('.sim-tasks li');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await canvas.focus();
  // 2.5·10⁻³ s → one power up (Shift) → 2.5·10⁻² s → one notch down → 2·10⁻² s
  await canvas.press('Shift+ArrowRight');
  await canvas.press('ArrowLeft');
  await expect(readout).toContainText('2·10⁻² s');
  await expect(readout).toContainText('20 ms');
  await expect(readout).toContainText('0.02 s');
  await expect(tasks.nth(0)).toHaveClass(/done/);

  await fig.getByRole('button', { name: 'אורך, במטר' }).click();
  await canvas.focus();
  // 2·10⁻² m → one power up → 2·10⁻¹ m → one notch down → 1.5·10⁻¹ m
  await canvas.press('Shift+ArrowRight');
  await canvas.press('ArrowLeft');
  await expect(readout).toContainText('15 cm');
  await expect(readout).toContainText('0.15 m');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-0-2a:set-20ms']).toBeTruthy();
  expect(p.tasks['fig-0-2a:set-15cm']).toBeTruthy();
});

test('km/h multiplied by 3.6 gets its own feedback and misconception tag', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.2-kmh"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('324');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('הכיוון הפוך');
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-0.2-kmh', misconception: 'MC-kmh-to-ms-multiply', confident: true });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('25');
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});

test('an area converted like a length is caught', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-0.2-area"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.locator('input[type=text]').fill('0.2');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q.locator('.q-feedback')).toContainText('כאילו זה אורך');
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-0.2-area', misconception: 'MC-area-units-scale-linearly' });
});

test('ranking lengths with a tie', async ({ page }) => {
  await page.goto(LESSON);
  const r = page.locator('[data-qid="Q-0.2-rank-lengths"]');
  await r.scrollIntoViewIfNeeded();
  await hydrated(r);
  // starts as 2 mm, 5·10⁻⁴ m, 3000 μm, 2·10⁶ nm; the answer is 3000 μm > 2 mm = 2·10⁶ nm > 5·10⁻⁴ m
  const up = r.getByRole('button', { name: 'למעלה' });
  await up.nth(2).click();
  await up.nth(1).click(); // 3000 μm, 2 mm, 5·10⁻⁴, 2·10⁶ nm
  await up.nth(3).click(); // 3000 μm, 2 mm, 2·10⁶ nm, 5·10⁻⁴
  await r.locator('.q-rank-rel').nth(1).click();
  await r.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(r).toHaveClass(/is-right/);
});

test('scrolling through the text steps ticks no task', async ({ page }) => {
  await page.goto(LESSON);
  const fig = page.locator('#fig-0-2a');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('.sim-readout')).toContainText('2.5 ms');
  for (const step of ['prefixes', 'milli', 'cm', 'milli', 'prefixes']) {
    await page.locator(`[data-step="${step}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
  }
  await expect(fig.locator('.sim-readout')).toContainText('1 s');
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(0);
  const p = await progress(page);
  expect(p.tasks?.['fig-0-2a:set-20ms']).toBeFalsy();
  expect(p.tasks?.['fig-0-2a:set-15cm']).toBeFalsy();
});
