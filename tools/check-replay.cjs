const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Pass the installed Playwright package path when it is outside this project.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'dist/data/sleep.json')));
const checksums = fs.readFileSync(path.join(root, 'dist/data/raw/bidsleep/SHA256SUMS.txt'), 'utf8');
for (const subject of data.subjects) {
  for (const night of subject.nights) {
    const raw = fs.readFileSync(path.join(root, 'dist', night.localFile));
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), night.sha256);
    assert.ok(checksums.includes(night.sha256));
    assert.equal(night.stages.filter(stage => stage >= 1 && stage <= 4).length / 2, night.sleepMinutes);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file:///' + path.join(root, 'dist/index.html').replaceAll('\\', '/'));
    await page.click('[data-view=health]');
    await page.click('.sleep-evidence summary');
    assert.match(await page.locator('.sleep-evidence').innerText(), /7.63 h/);
    assert.match(await page.locator('.sleep-evidence').innerText(), /4.97 h/);
    await page.click('[data-view=overview]');
    await page.click('#review-checkin');
    await page.click('#confirm-down');
    assert.equal(await page.locator('input[value=alvarez]').isChecked(), true);
    await page.uncheck('#alvarez-available');
    assert.equal(await page.locator('input[value=defer]').isChecked(), true);
    assert.equal(await page.locator('input[value=alvarez]').isDisabled(), true);
    await page.click('#coverage-form button[type=submit]');
    assert.equal(await page.evaluate(() => inspectionStatus()), 'Deferred');
    await page.click('[data-close]');
    await page.click('[data-view=plan]');
    await page.click('#review-options');
    await page.check('#alvarez-available');
    await page.click('#coverage-form button[type=submit]');
    assert.equal(await page.evaluate(() => state.assigned), 'alvarez');
    assert.equal(await page.evaluate(() => tasks().find(t => t.title === 'Plant growth experiment').time), '13:00');
    await page.click('#show-packet');
    assert.match(await page.locator('.packet').innerText(), /7.63 h/);
    assert.match(await page.locator('.packet').innerText(), /13:00/);
    await page.click('[data-close]');
    await page.click('[data-view=health]');
    await page.click('#new-checkin');
    assert.equal(await page.locator('#checkin-form').evaluate(form => form.checkValidity()), true);
    await page.click('#checkin-form button[type=submit]');
    assert.equal(await page.evaluate(() => byId('chen').sleepSource), 'bidsleep');
    await page.click('#new-checkin');
    await page.fill('[name=sleep]', '6.5');
    await page.click('#checkin-form button[type=submit]');
    assert.equal(await page.evaluate(() => byId('chen').sleepSource), 'manual');
    await page.reload();
    assert.equal(await page.evaluate(() => byId('chen').sleep), 6.5);
    await page.click('[data-action=measured]');
    assert.equal(await page.evaluate(() => byId('chen').sleepSource), 'bidsleep');
    assert.equal(await page.evaluate(() => byId('chen').state), 'down');
    await page.evaluate(() => { state = freshState(); render(); });
    for (const width of [1440, 1024, 820, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [view, visibleId] of [['overview','overview-content'],['health','health-workspace'],['plan','mission-workspace'],['log','log-panel']]) {
        await page.click('[data-view='+view+']');
        assert.equal(await page.locator('#'+visibleId).isVisible(), true);
        assert.equal(await page.locator('#crew-section').isVisible(), view === 'health');
        assert.equal(await page.locator('#mission-workspace').isVisible(), view === 'plan');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, view+' overflow at '+width);
        assert.equal(await page.locator('.avatar, .tiny-avatar').count(), 0);
      }
    }
    await page.click('[data-view=health]');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Older saved check-ins retain their values and offer an explicit replay load.
    await page.evaluate(() => { const c = byId('chen'); delete c.sleepSource; c.sleep = 6; persist(); });
    await page.reload();
    assert.equal(await page.evaluate(() => byId('chen').sleep), 6);
    assert.equal(await page.locator('[data-action=measured]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: source checksums, sleep totals, offline replay, availability branches, rescheduling, evidence packet, manual data provenance, persistence, legacy state, mobile overflow.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
