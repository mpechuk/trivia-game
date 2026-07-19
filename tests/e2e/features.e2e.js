// Feature scenarios: JSON-driven theming, the ?debug=1 network diagnostics
// panel, reload-reconnect with state resync, the host End-question button,
// Play again with the same room, and the GitHub-Pages subpath invariant.
import { BASE, SUBPATH_URL, THEME_BASE, launchBrowser, setupGame, watch } from './helpers.js';

export async function run(errors) {
  const browser = await launchBrowser();

  // ---------- JSON-driven theming ----------
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p, 'theme', errors);
    await p.goto(THEME_BASE);
    await p.getByRole('button', { name: /Play solo/ }).waitFor({ timeout: 10000 });
    const vars = await p.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        primary: s.getPropertyValue('--primary').trim(),
        btn0: s.getPropertyValue('--btn-0-color').trim(),
        font: s.getPropertyValue('--font-family').trim(),
        title: document.title,
      };
    });
    if (vars.primary !== '#ff00aa') throw new Error(`--primary not applied: ${vars.primary}`);
    if (vars.btn0 !== '#111111') throw new Error(`--btn-0-color not applied: ${vars.btn0}`);
    if (!vars.font.includes('Georgia')) throw new Error(`font not applied: ${vars.font}`);
    if (!vars.title.includes('Theme Test')) throw new Error(`title not applied: ${vars.title}`);
    console.log('THEME OK — colors, font, and title all come from the JSON');
    await ctx.close();
  }

  // ---------- ?debug=1 network diagnostics panel ----------
  {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const host = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    watch(host, 'dbg-host', errors);
    watch(p1, 'dbg-p1', errors);

    await host.goto(`${BASE}&debug=1`);
    await host.getByRole('button', { name: /Host multiplayer/ }).click();
    await setupGame(host, { count: '3', timer: '30' });
    await host.getByRole('button', { name: /Create room/ }).click();
    await host.locator('.lobby-code').waitFor({ timeout: 20000 });
    const code = (await host.locator('.lobby-code').textContent()).trim();
    const hostLog = await host.locator('#net-debug').textContent();
    if (!hostLog.includes('broker connected')) {
      throw new Error(`host debug panel missing broker line: ${hostLog}`);
    }

    await p1.goto(`${BASE}&debug=1#/join/${code}`);
    await p1.locator('input.input:not(.input-code)').first().fill('Anna');
    await p1.getByRole('button', { name: /Join game/ }).click();
    await p1.locator('.player-waiting').waitFor({ timeout: 20000 });
    await p1
      .locator('#net-debug .net-debug-line', { hasText: 'data channel open' })
      .waitFor({ timeout: 10000 });
    const p1Log = await p1.locator('#net-debug').textContent();
    if (!/local candidate/.test(p1Log)) {
      throw new Error(`player debug panel missing ICE candidate lines: ${p1Log}`);
    }
    if (!p1Log.includes('ice state:')) {
      throw new Error(`player debug panel missing ICE state lines: ${p1Log}`);
    }

    // And it stays off without the flag.
    const plain = await p1Ctx.newPage();
    watch(plain, 'dbg-plain', errors);
    await plain.goto(BASE);
    await plain.getByRole('button', { name: /Play solo/ }).waitFor({ timeout: 10000 });
    if (await plain.locator('#net-debug').count()) {
      throw new Error('debug panel rendered without ?debug=1');
    }
    console.log('DEBUG PANEL OK — broker/ICE/data-channel lines on host and player, off by default');

    await hostCtx.close();
    await p1Ctx.close();
  }

  // ---------- reconnect, End-question, Play again ----------
  {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const host = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    watch(host, 'host', errors);
    watch(p1, 'p1', errors);

    await host.goto(BASE);
    await host.getByRole('button', { name: /Host multiplayer/ }).click();
    await setupGame(host, { count: '3', timer: '30' });
    await host.getByRole('button', { name: /Create room/ }).click();
    await host.locator('.lobby-code').waitFor({ timeout: 20000 });
    const code = (await host.locator('.lobby-code').textContent()).trim();

    await p1.goto(`${BASE}#/join/${code}`);
    await p1.locator('input.input:not(.input-code)').first().fill('Anna');
    await p1.getByRole('button', { name: /Join game/ }).click();
    await p1.locator('.player-waiting').waitFor({ timeout: 20000 });
    await host.getByRole('button', { name: /Start game/ }).click();

    // Q1 — answer normally.
    await p1.locator('button.player-answer').first().waitFor({ timeout: 20000 });
    await p1.locator('button.player-answer').nth(0).click();
    await host.locator('.answer-line').waitFor({ timeout: 20000 });

    // Q2 — reload the phone mid-question; it must bounce to the join screen
    // with the code prefilled, and rejoin into the running round.
    await p1.locator('button.player-answer').first().waitFor({ timeout: 30000 });
    await p1.reload();
    await p1.locator('input.input-code').waitFor({ timeout: 15000 });
    const prefilled = await p1.locator('input.input-code').inputValue();
    if (prefilled !== code) throw new Error(`code not prefilled after reload: "${prefilled}"`);
    await p1.getByRole('button', { name: /Join game/ }).click();
    await p1
      .locator('button.player-answer, .player-result, .player-locked')
      .first()
      .waitFor({ timeout: 20000 });
    const rows = await host.locator('.standings .standing-row').count();
    if (rows !== 1) throw new Error(`host standings should have 1 row, has ${rows}`);
    console.log('RECONNECT OK — code prefilled, state resynced, no duplicate player');

    const btns = p1.locator('button.player-answer');
    if (await btns.count()) await btns.nth(1).click().catch(() => {});
    await host.locator('.answer-line').waitFor({ timeout: 35000 });

    // Q3 — the host force-ends the round before anyone answers.
    await host.locator('.answer-tile').first().waitFor({ timeout: 30000 });
    await host.getByRole('button', { name: /End question now/ }).click();
    await host.locator('.answer-line').waitFor({ timeout: 10000 });
    console.log('END-QUESTION OK — host button closes the round');

    // Podium → Play again keeps the room, the roster, and resets scores.
    await host.locator('.podium').waitFor({ timeout: 30000 });
    await p1.locator('.player-final').waitFor({ timeout: 15000 });
    await host.getByRole('button', { name: /Play again/ }).click();
    await host.locator('.lobby-code').waitFor({ timeout: 10000 });
    const codeAgain = (await host.locator('.lobby-code').textContent()).trim();
    if (codeAgain !== code) throw new Error('room code changed on play-again');
    await host.locator('.player-chip').first().waitFor({ timeout: 10000 });
    await p1.locator('.player-waiting').waitFor({ timeout: 10000 });
    await host.getByRole('button', { name: /Start game/ }).click();
    await p1.locator('button.player-answer').first().waitFor({ timeout: 20000 });
    console.log('PLAY AGAIN OK — same room, same players, fresh game');

    await hostCtx.close();
    await p1Ctx.close();
  }

  // ---------- zombie-connection reconnect (phone screen-lock regression) ----------
  // Waking a locked phone re-dials while the old connection is half-alive.
  // The old connection's close event must not trigger another reconnect
  // (join storm → host closes previous conn → close → retry → …), and an
  // identical STATE resync must not rebuild the answer buttons (flicker /
  // missed taps).
  {
    const hostCtx = await browser.newContext();
    const p1Ctx = await browser.newContext();
    const host = await hostCtx.newPage();
    const p1 = await p1Ctx.newPage();
    watch(host, 'host', errors);
    watch(p1, 'p1', errors);

    await host.goto(BASE);
    await host.getByRole('button', { name: /Host multiplayer/ }).click();
    await setupGame(host, { count: '3', timer: '30' });
    await host.getByRole('button', { name: /Create room/ }).click();
    await host.locator('.lobby-code').waitFor({ timeout: 20000 });
    const code = (await host.locator('.lobby-code').textContent()).trim();

    await p1.goto(`${BASE}#/join/${code}`);
    await p1.locator('input.input:not(.input-code)').first().fill('Anna');
    await p1.getByRole('button', { name: /Join game/ }).click();
    await p1.locator('.player-waiting').waitFor({ timeout: 20000 });
    await host.getByRole('button', { name: /Start game/ }).click();
    await p1.locator('button.player-answer').first().waitFor({ timeout: 20000 });

    // Count re-joins on the host and mark the live DOM on the player.
    await host.evaluate(() => {
      const net = window.__trivia.session.host.net;
      window.__joinCount = 0;
      const orig = net.onJoin;
      net.onJoin = (j) => { window.__joinCount++; orig(j); };
    });
    await p1.evaluate(() => {
      document.querySelector('button.player-answer').dataset.marker = 'keep';
      // Simulate the post-screen-lock wakeup: dial a second connection while
      // the first one is still attached on the host.
      window.__trivia.session.player.net._dial();
    });

    // Long enough for the broken version's 1s/2s/4s retry storm to show up.
    await p1.waitForTimeout(8500);

    const joins = await host.evaluate(() => window.__joinCount);
    if (joins > 1) throw new Error(`reconnect storm: ${joins} re-joins after one transport drop`);
    const conns = await host.evaluate(() => window.__trivia.session.host.net.connections.size);
    if (conns !== 1) throw new Error(`host should hold exactly 1 connection, has ${conns}`);
    const marker = await p1.evaluate(
      () => document.querySelector('button.player-answer')?.dataset.marker
    );
    if (marker !== 'keep') throw new Error('player view was rebuilt (flicker) by an identical resync');

    // Taps must register after recovery.
    await p1.locator('button.player-answer').nth(0).click();
    await p1.locator('.player-locked').waitFor({ timeout: 5000 });
    await host.locator('.answer-line').waitFor({ timeout: 20000 });
    console.log('ZOMBIE-RECONNECT OK — one re-join, no flicker, taps register');

    await hostCtx.close();
    await p1Ctx.close();
  }

  // ---------- subpath serving (GitHub Pages /trivia-game/ invariant) ----------
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p, 'subpath', errors);
    const missing = [];
    p.on('response', (r) => {
      if (r.status() === 404) missing.push(r.url());
    });
    await p.goto(SUBPATH_URL);
    await p.getByRole('button', { name: /Play solo/ }).waitFor({ timeout: 10000 });
    if (missing.length) throw new Error(`404s under subpath: ${missing.join(', ')}`);
    console.log('SUBPATH OK — no 404s when served from /trivia-game/');
    await ctx.close();
  }

  await browser.close();
}
