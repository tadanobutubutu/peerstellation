import { expect, test } from '@playwright/test';

const SCENE_READY_TIMEOUT_MS = 30_000;

test('starts camera travel after a page click without stealing editable input', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready', {
    timeout: SCENE_READY_TIMEOUT_MS,
  });
  await page.getByRole('button', { name: /pause motion/i }).click();

  const canvas = page.locator('#universe-canvas');
  const before = Number(await canvas.getAttribute('data-camera-distance'));
  // Dispatch on the document body to model a normal page click that leaves
  // the canvas unfocused. The renderer's document listener should route this
  // to the same camera path as a canvas keydown.
  await page.evaluate(() => {
    const keydown = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyW',
      key: 'w',
    });
    document.body.dispatchEvent(keydown);
    document.body.dispatchEvent(
      new KeyboardEvent('keyup', {
        bubbles: true,
        code: 'KeyW',
        key: 'w',
      }),
    );
  });
  const after = Number(await canvas.getAttribute('data-camera-distance'));
  expect(after).toBeLessThan(before);

  await page.getByRole('button', { name: /settings/i }).click();
  const dialog = page.getByRole('dialog', { name: /tune the sky|settings/i });
  await expect(dialog).toBeVisible();
  const dialogBefore = Number(
    await canvas.getAttribute('data-camera-distance'),
  );
  await dialog.locator('#settings-language').press('w');
  const dialogAfter = Number(await canvas.getAttribute('data-camera-distance'));
  expect(dialogAfter).toBe(dialogBefore);
});
