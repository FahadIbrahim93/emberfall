const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const PORTAL = path.join(ROOT, 'dist-portal');
let server, origin;

// Serve the real generated distribution: cloud.js is absent, not stubbed.
test.beforeAll(async () => {
  const gitBash = 'C:/Program Files/Git/bin/bash.exe';
  const bash = process.env.EMBERFALL_BASH || (process.platform === 'win32' && fs.existsSync(gitBash) ? gitBash : 'bash');
  const built = spawnSync(bash, ['tools/build-portal.sh'], { cwd: ROOT, encoding: 'utf8', timeout: 45000 });
  expect(built.status, built.stdout + built.stderr).toBe(0);
  expect(fs.existsSync(path.join(PORTAL, 'js/cloud.js'))).toBe(false);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://portal.test').pathname;
    if (name === '/frame.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<iframe title="Portal game" src="/index.html" style="width:100%;height:95vh"></iframe>');
    }
    const file = path.resolve(PORTAL, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(PORTAL + path.sep)) { res.writeHead(404); return res.end(); }
    fs.readFile(file, (err, bytes) => {
      res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(err ? '' : bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});

test.afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function boot(page, url = origin) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof startRun === 'function');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => GAME.state === 'title');
  await page.evaluate(() => { CODEX.mute = true; });
}

test('packaged portal Boards opens without an account controller or external requests', async ({ page }) => {
  const external = [];
  page.on('request', r => { if (new URL(r.url()).origin !== origin) external.push(r.url()); });
  await boot(page);
  expect(await page.evaluate(() => typeof CLOUD)).toBe('undefined');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.locator('#acctSheet')).toHaveClass(/on/);
  await expect(page.locator('#globalBody')).toBeVisible();
  await page.locator('.btab[data-board="all"]').click();
  await expect(page.locator('#globalBoardNote')).toHaveText('All-time runs saved on this device.');
  expect(external).toEqual([]);
});

test('packaged portal removes unavailable sign-in and installation controls', async ({ page }) => {
  await boot(page);
  for (const id of ['btnPilot', 'acctPanel', 'btnAcctSign', 'btnAcctGuest', 'ovCloud', 'btnInstall']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }
});

for (const mode of ['daily', 'rush']) {
  test(`portal All-time stays on the main board after a ${mode} run`, async ({ page }) => {
    await boot(page);
    await page.evaluate(mode => {
      DB.set(boardKey('main'), [{ n: 'MAIN-PILOT', s: 1111, w: 2, k: 'wraith' }]);
      DB.set(boardKey('daily'), [{ n: 'DAY-PILOT', s: 2222, w: 3, k: 'vesper' }]);
      DB.set(boardKey('rush'), [{ n: 'RUSH-PILOT', s: 3333, w: 4, k: 'atlas' }]);
      startRun(mode); GAME.paused = true; toTitle(); NET.renderGlobal();
    }, mode);
    await expect(page.locator('#globalBoard')).toContainText('MAIN-PILOT');
    await expect(page.locator('#dailyBoard')).toContainText('DAY-PILOT');
    await expect(page.locator('#globalBoard')).not.toContainText('DAY-PILOT');
    await expect(page.locator('#globalBoard')).not.toContainText('RUSH-PILOT');
  });
}

test('portal sheet contains keyboard focus and returns it on every close path', async ({ page }) => {
  await boot(page);
  const boards = page.getByRole('button', { name: 'Boards', exact: true });
  await boards.click();
  await expect(page.locator('#sheetTitle')).toHaveText('Local leaderboards');
  await expect(page.locator('#sheetEyebrow')).toHaveText('This device');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.btab[data-board="all"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#sheetClose')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#acctSheet')).toHaveAttribute('aria-hidden', 'true');
  await expect(boards).toBeFocused();
  await boards.click();
  await page.locator('#sheetClose').click();
  await expect(boards).toBeFocused();
  await boards.click();
  await page.locator('.sheet-scrim').click({ position: { x: 2, y: 2 } });
  await expect(boards).toBeFocused();
  await expect(page.locator('#tab-global #globalBody')).toHaveCount(1);
  await expect(page.locator('#sheetBody #globalBody')).toHaveCount(0);
});

test('query portal mode hides auth and opens local Boards without remote reads', async ({ page }) => {
  const external = [];
  page.on('request', r => {
    if (new URL(r.url()).origin !== new URL(test.info().project.use.baseURL).origin) external.push(r.url());
  });
  await boot(page, '/?portal=1');
  await expect(page.locator('#acctPanel')).toBeHidden();
  await expect(page.locator('#btnPilot')).toBeHidden();
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.locator('#sheetTitle')).toHaveText('Local leaderboards');
  await expect(page.locator('#cloudBox')).toBeHidden();
  expect(external).toEqual([]);
});

test('real framed portal keeps Boards functional and auth absent', async ({ page }) => {
  const external = [];
  page.on('request', r => { if (new URL(r.url()).origin !== origin) external.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/frame.html');
  const frame = page.frames().find(f => f.url() === origin + '/index.html');
  await frame.waitForFunction(() => typeof startRun === 'function');
  await frame.locator('#s-boot').click();
  await frame.waitForFunction(() => GAME.state === 'title');
  await frame.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(frame.locator('#sheetTitle')).toHaveText('Local leaderboards');
  await expect(frame.locator('#btnPilot')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#btnBoards')).toBeFocused();
  expect(external).toEqual([]);
});

test('packaged file play opens saved local rankings without Auth', async ({ page }) => {
  await boot(page, pathToFileURL(path.join(PORTAL, 'index.html')).href);
  await page.evaluate(() => DB.set(boardKey('daily'), [{ n: 'OFFLINE', s: 4567, w: 4, k: 'wraith' }]));
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.locator('#dailyBoard')).toContainText('OFFLINE');
  expect(await page.evaluate(() => typeof CLOUD)).toBe('undefined');
});

test('touch portal navigation opens, switches and closes the shared sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await boot(page);
    const boards = page.getByRole('button', { name: 'Boards', exact: true });
    expect((await boards.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await boards.tap();
    await page.locator('.btab[data-board="all"]').tap();
    await expect(page.locator('#globalBoard')).toBeVisible();
    await page.locator('#sheetClose').tap();
    await expect(page.locator('#acctSheet')).toHaveAttribute('aria-hidden', 'true');
  } finally { await context.close(); }
});

test('hosted accounts and Boards use the same sheet without duplicate content', async ({ page }) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await boot(page, '/');
  await page.getByRole('button', { name: 'Pilot account', exact: true }).click();
  await expect(page.locator('#cloudEmail')).toBeVisible();
  await expect(page.locator('#sheetTitle')).toHaveText('Sign in');
  await page.keyboard.press('Escape');
  await expect(page.locator('#btnPilot')).toBeFocused();
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.locator('#sheetEyebrow')).toHaveText('Worldwide');
  await expect(page.locator('#cloudBox')).toBeHidden();
  await page.locator('#sheetClose').click();
  await expect(page.locator('#tab-global #globalBody')).toHaveCount(1);
  await expect(page.locator('#globalBody')).toHaveCount(1);
});

test('a cached navigation controller without the sheet API retains inline accounts and Boards', async ({ page }) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await page.route('**/js/net.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() +
      '\ndelete NET.openSheet; delete NET.closeSheet; delete NET.wireBoards; delete NET.showBoards; delete NET.sheetHead; delete NET.sheetView;' });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page, '/');
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.locator('#tab-global')).toBeVisible();
  await expect(page.locator('#globalBody')).toBeVisible();
  await page.evaluate(() => CLOUD.showAccount());
  await expect(page.locator('#cloudEmail')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a cached account controller retains its header and focus contracts with shared navigation', async ({ page }) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await boot(page, '/');
  await page.evaluate(() => {
    // The previous account controller owned these two pieces of sheet state.
    CLOUD.sheetView = 'acct';
    CLOUD.sheetHead = function () {
      document.getElementById('sheetTitle').textContent = this.sheetView === 'boards' ? 'Leaderboards' : 'Sign in';
    };
  });
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await page.evaluate(() => CLOUD.open());
  await expect(page.locator('#sheetTitle')).toHaveText('Leaderboards');
  await page.locator('#sheetClose').click();
  await page.locator('#btnPilot').focus();
  await page.evaluate(() => {
    // Model the legacy account opener, which saved focus outside NET.
    CLOUD._ret = document.activeElement;
    CLOUD.sheetView = 'acct';
    const body = document.getElementById('sheetBody'), tab = document.getElementById('tab-global');
    while (tab.firstChild) body.appendChild(tab.firstChild);
    document.getElementById('acctSheet').classList.add('on');
    document.getElementById('acctSheet').setAttribute('aria-hidden', 'false');
  });
  await page.locator('#sheetClose').click();
  await expect(page.locator('#btnPilot')).toBeFocused();
  await expect(page.locator('#tab-global #globalBody')).toHaveCount(1);
});
