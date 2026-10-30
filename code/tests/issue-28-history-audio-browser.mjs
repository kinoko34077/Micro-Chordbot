import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => {
    window.__mcAudioActivity = 0;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const createOscillator = AudioContextClass.prototype.createOscillator;
    AudioContextClass.prototype.createOscillator = function(...args) {
      const oscillator = createOscillator.apply(this, args);
      const frequency = oscillator.frequency;
      const ramp = frequency.linearRampToValueAtTime.bind(frequency);
      frequency.linearRampToValueAtTime = (value, time) => {
        window.__mcAudioActivity += 1;
        return ramp(value, time);
      };
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...startArgs) => {
        window.__mcAudioActivity += 1;
        return start(...startArgs);
      };
      return oscillator;
    };
  });

  await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="progression"]').click();
  const cells = page.locator("#progressionGrid .progression-cell");
  await cells.first().waitFor({state:"visible",timeout:5000});
  await cells.first().click();
  await page.waitForFunction(() => window.__mcAudioActivity > 0, null, {timeout:3000});

  const currentChordId = await page.locator("#progChordButtonGrid button.active").getAttribute("data-chord-id");
  const nextChord = page.locator("#progChordButtonGrid button[data-chord-id]:not(.active)").first();
  const nextChordId = await nextChord.getAttribute("data-chord-id");
  assert.ok(currentChordId && nextChordId && nextChordId !== currentChordId,
    "browser fixture needs a different chord choice");

  const beforeEditActivity = await page.evaluate(() => window.__mcAudioActivity);
  await nextChord.click();
  await page.waitForFunction((count) => window.__mcAudioActivity > count,
    beforeEditActivity, {timeout:3000});
  assert.equal(await page.locator("#progChordButtonGrid button.active").getAttribute("data-chord-id"), nextChordId,
    "progression chord edit was not applied");

  const beforeUndoActivity = await page.evaluate(() => window.__mcAudioActivity);
  await page.locator("#undoBtn").click();
  await page.waitForFunction((count) => window.__mcAudioActivity > count,
    beforeUndoActivity, {timeout:3000});
  assert.equal(await page.locator("#progChordButtonGrid button.active").getAttribute("data-chord-id"), currentChordId,
    "Undo did not restore the previous chord");

  const beforeRedoActivity = await page.evaluate(() => window.__mcAudioActivity);
  await page.locator("#redoBtn").click();
  await page.waitForFunction((count) => window.__mcAudioActivity > count,
    beforeRedoActivity, {timeout:3000});
  assert.equal(await page.locator("#progChordButtonGrid button.active").getAttribute("data-chord-id"), nextChordId,
    "Redo did not restore the edited chord");
  assert.deepEqual(errors,[],"history audio browser flow emitted uncaught errors");
  console.log("UNDO_REDO_CODE_AUDIO", JSON.stringify({currentChordId,nextChordId,
    audioActivity: await page.evaluate(() => window.__mcAudioActivity)}));
  await page.close();
} finally {
  await browser.close();
}
