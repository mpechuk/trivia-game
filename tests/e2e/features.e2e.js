// Feature scenarios: JSON-driven theming, reload-reconnect with state resync,
// the host End-question button, Play again with the same room, and the
// GitHub-Pages subpath invariant.
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
