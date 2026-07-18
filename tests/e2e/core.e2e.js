// Core gameplay scenarios: solo (timed + no-limit) and a full multiplayer
// game — joins, name collision, answer locking, deadline close, disconnect
// handling, late-join rejection, podium.
import { BASE, launchBrowser, setupGame, watch } from './helpers.js';

export async function run(errors) {
  const browser = await launchBrowser();

  // ---------------- SOLO, 10s timer ----------------
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p, 'solo', errors);
    await p.goto(BASE);
    await p.getByRole('button', { name: /Play solo/ }).click();
    await p.locator('input.input').first().fill('Tester');
    await setupGame(p, { count: '3', timer: '10' });
    await p.getByRole('button', { name: /Start solo game/ }).click();

    for (let i = 0; i < 3; i++) {
      const tile = p.locator('button.answer-tile').first();
      await tile.waitFor({ state: 'visible', timeout: 20000 });
      const t = await p.locator('.timer-text').textContent();
      if (!/^\d+$/.test(t) || Number(t) > 10) throw new Error(`solo timer looks wrong: "${t}"`);
      await tile.click();
      await p.locator('.answer-line').waitFor({ timeout: 20000 });
      console.log(`  solo q${i + 1}: ${await p.locator('.solo-result').textContent()}`);
      await p.getByRole('button', { name: 'Next ▸' }).click();
      await p.locator('.race-track').waitFor({ timeout: 10000 });
    }
    await p.locator('.podium').waitFor({ timeout: 30000 });
    console.log('SOLO OK — podium reached');
    await ctx.close();
  }

  // ---------------- SOLO, no time limit ----------------
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p, 'solo-nolimit', errors);
    await p.goto(BASE);
    await p.getByRole('button', { name: /Play solo/ }).click();
    await setupGame(p, { count: '3', timer: '0' });
    await p.getByRole('button', { name: /Start solo game/ }).click();
    const tile = p.locator('button.answer-tile').first();
    await tile.waitFor({ state: 'visible', timeout: 20000 });
    const t = await p.locator('.timer-text').textContent();
    if (t !== '∞') throw new Error(`no-limit timer should show ∞, got "${t}"`);
    await p.waitForTimeout(3000); // question must NOT auto-close
    if (!(await p.locator('button.answer-tile').first().isVisible())) {
      throw new Error('no-limit question closed by itself');
    }
    await tile.click();
    await p.locator('.answer-line').waitFor({ timeout: 20000 });
    console.log('SOLO NO-LIMIT OK — waits indefinitely, closes on answer');
    await ctx.close();
  }

  // ---------------- MULTIPLAYER ----------------
  {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const host = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();
    watch(host, 'host', errors);
    watch(p1, 'p1', errors);
    watch(p2, 'p2', errors);

    await host.goto(BASE);
    await host.getByRole('button', { name: /Host multiplayer/ }).click();
    await setupGame(host, { count: '3', timer: '10' });
    await host.getByRole('button', { name: /Create room/ }).click();
    await host.locator('.lobby-code').waitFor({ timeout: 20000 });
    const code = (await host.locator('.lobby-code').textContent()).trim();
    console.log('  room code:', code);

    // Both players pick the same name — the host must dedupe it.
    for (const p of [p1, p2]) {
      await p.goto(`${BASE}#/join/${code}`);
      await p.locator('input.input:not(.input-code)').first().fill('Anna');
      await p.getByRole('button', { name: /Join game/ }).click();
      await p.locator('.player-waiting').waitFor({ timeout: 20000 });
    }
    await host.locator('.player-chip').nth(1).waitFor({ timeout: 10000 });
    const chipText = await host.locator('.lobby-players').textContent();
    if (!chipText.includes('Anna 2')) {
      throw new Error(`name collision not deduped, lobby shows: ${chipText}`);
    }
    console.log('  both players in lobby (duplicate name became "Anna 2")');

    await host.getByRole('button', { name: /Start game/ }).click();

    // Q1: both answer → early close, acks, reveal, race
    for (const p of [p1, p2]) {
      await p.locator('button.player-answer').first().waitFor({ timeout: 20000 });
    }
    // Player answer buttons are stacked horizontal bars (single column), and
    // the game requested a screen wake lock to stop the phone sleeping.
    const layout = await p1.evaluate(() => {
      const box = document.querySelector('.player-buttons');
      const style = getComputedStyle(box);
      const btns = [...document.querySelectorAll('.player-answer')];
      const oneColumn = btns.every((b) => Math.abs(b.getBoundingClientRect().left - btns[0].getBoundingClientRect().left) < 1);
      return { display: style.display, direction: style.flexDirection, oneColumn };
    });
    if (layout.display !== 'flex' || layout.direction !== 'column' || !layout.oneColumn) {
      throw new Error(`player buttons not a horizontal-bar stack: ${JSON.stringify(layout)}`);
    }
    const wantsWakeLock = await p1.evaluate(() => window.__trivia.wakeLock.wanted === true);
    if (!wantsWakeLock) throw new Error('player screen did not request a wake lock');
    console.log('  player buttons are stacked horizontal bars; wake lock requested');

    await p1.locator('button.player-answer').nth(0).click();
    await p1.locator('.player-locked').waitFor({ timeout: 5000 });
    await p2.locator('button.player-answer').nth(1).click();
    await host.locator('.answer-line').waitFor({ timeout: 20000 });
    for (const [p, name] of [[p1, 'p1'], [p2, 'p2']]) {
      await p.locator('.player-result').waitFor({ timeout: 10000 });
      console.log(`  ${name}:`, (await p.locator('.player-result h2').textContent()).trim());
    }
    await host.locator('.race-track').waitFor({ timeout: 15000 });
    console.log('  Q1 OK (answers, lock, reveal, race)');

    // A stranger trying to join mid-game is turned away.
    const lateCtx = await browser.newContext();
    const p3 = await lateCtx.newPage();
    watch(p3, 'p3', errors);
    await p3.goto(`${BASE}#/join/${code}`);
    await p3.locator('input.input:not(.input-code)').first().fill('Late');
    await p3.getByRole('button', { name: /Join game/ }).click();
    await p3.locator('.status-line').filter({ hasText: 'in progress' }).waitFor({ timeout: 20000 });
    console.log('  late join correctly rejected');
    await lateCtx.close();

    // Q2: p2 stays silent → the 10s deadline closes the question.
    await p1.locator('button.player-answer').first().waitFor({ timeout: 30000 });
    await p1.locator('button.player-answer').nth(0).click();
    await host.locator('.answer-line').waitFor({ timeout: 25000 });
    console.log('  Q2 OK (deadline closed with a silent player)');

    // Q3: p2 disconnects mid-question; the round must not wait for them.
    await p1.locator('button.player-answer').first().waitFor({ timeout: 30000 });
    await p2Ctx.close();
    await host.waitForTimeout(1500); // let the host register the disconnect
    await p1.locator('button.player-answer').nth(2).click();
    await host.locator('.answer-line').waitFor({ timeout: 25000 });
    console.log('  Q3 OK (disconnected player skipped in all-answered check)');

    await host.locator('.podium').waitFor({ timeout: 30000 });
    await p1.locator('.player-final').waitFor({ timeout: 15000 });
    console.log('  final on p1:', (await p1.locator('.player-final h2').textContent()).trim());
    console.log('MULTIPLAYER OK — podium + player final screens');

    await hostCtx.close();
    await p1Ctx.close();
  }

  await browser.close();
}
