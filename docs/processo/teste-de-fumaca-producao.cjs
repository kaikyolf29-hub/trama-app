// Teste de fumaça em produção: cria uma conta temporária, um fluxo, salva e confere Agenda e
// Configurações. A conta é apagada depois, pelo banco.
const { chromium } = require('playwright');

const SITE = 'https://trama.trama-kaiky.workers.dev';
const out = process.argv[2];
const email = process.argv[3];
const password = 'Fumaca-' + Date.now() + '!x';

(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  const failed = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('response', (r) => {
    if (r.url().includes('trama-api') && r.status() >= 400)
      failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('ok  ', name);
    } catch (e) {
      console.log('FALHOU', name, String(e).slice(0, 300));
      await page.screenshot({ path: `${out}/falhou-${name.replace(/\W+/g, '-')}.png` });
    }
  };

  await step('cadastro', async () => {
    await page.goto(SITE + '/criar-conta');
    await page.getByLabel(/nome/i).first().fill('Teste Fumaça');
    await page
      .getByLabel(/e-mail/i)
      .first()
      .fill(email);
    await page
      .getByLabel(/^senha/i)
      .first()
      .fill(password);
    const confirm = page.getByLabel(/repita|confirme/i);
    if (await confirm.count()) await confirm.first().fill(password);
    await page.getByRole('button', { name: /criar conta/i }).click();
    await page.waitForURL((u) => !u.pathname.includes('criar-conta'), { timeout: 20000 });
  });

  await step('inicio', async () => {
    await page.goto(SITE + '/');
    await page
      .getByText(/em branco/i)
      .first()
      .waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${out}/1-inicio.png` });
  });

  await step('criar fluxo e salvar', async () => {
    await page
      .getByText(/em branco/i)
      .first()
      .click();
    await page.waitForURL(/\/p\//, { timeout: 15000 });
    await page.waitForSelector('.react-flow__pane', { timeout: 15000 });
    await page.mouse.click(700, 450);
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    await page
      .getByText(/^Salvo$/)
      .first()
      .waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${out}/2-quadro.png` });
  });

  await step('agenda', async () => {
    await page.goto(SITE + '/agenda');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/3-agenda.png` });
    const body = await page.locator('body').innerText();
    if (!/criad/i.test(body)) throw new Error('não achei o evento "criado" na Agenda');
  });

  await step('configuracoes', async () => {
    await page.goto(SITE + '/configuracoes');
    await page
      .getByText(/Fuso horário/)
      .first()
      .waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/4-config.png`, fullPage: true });
  });

  await step('falar e organizar', async () => {
    await page.goto(SITE + '/');
    await page
      .getByText(/falar e organizar/i)
      .first()
      .click();
    await page.waitForURL(/\/falar/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/5-falar.png` });
  });

  console.log('erros do console:', JSON.stringify(errors.slice(0, 8)));
  console.log('respostas da API com erro:', JSON.stringify(failed.slice(0, 12)));
  await browser.close();
})();
