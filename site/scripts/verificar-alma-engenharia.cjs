/* Regressão local da seção de engenharia, sem enviar leads nem eventos reais. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.BASE_URL || "http://localhost:3200";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const capturas = process.env.CAPTURAS_DIR || "/tmp/alma-engenharia-qa";
fs.mkdirSync(capturas, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const largura of [1440, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width: largura, height: largura > 500 ? 900 : 844 },
        reducedMotion: "reduce",
      });
      const erros = [];
      page.on("pageerror", (erro) => erros.push(erro.message));
      await page.route("**/api/**", (rota) =>
        rota.fulfill({ json: { ok: true, gravado: false } }),
      );
      await page.addInitScript(() =>
        localStorage.setItem("bossa_consent", "necessarios"),
      );
      await page.goto(`${base}/empreendimentos/alma-seahouses`);
      await page.locator("#engenharia").waitFor();
      assert.equal(await page.locator("#engenharia .al-engenharia-cartao").count(), 4);
      assert.equal(await page.locator("#engenharia .al-engenharia-registro img").count(), 3);
      assert.equal(await page.locator('nav[aria-label="Nesta página do Alma"] a[href="#engenharia"]').count(), 1);
      assert.match(await page.locator("#engenharia .al-engenharia-rodape").innerText(), /adotará esses quatro métodos também no Alma/i);
      assert.equal(await page.locator("#relatos .al-relato").count(), 4);
      await page.locator("#engenharia").scrollIntoViewIfNeeded();
      await page.locator("#engenharia img").evaluateAll(async (imgs) =>
        Promise.all(imgs.map((img) => img.decode())),
      );
      await page.screenshot({ path: path.join(capturas, `engenharia-${largura}.png`) });
      const medidas = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        larguraConteudo: document.documentElement.scrollWidth,
      }));
      assert(medidas.larguraConteudo <= medidas.viewport, JSON.stringify(medidas));
      assert.deepEqual(erros, []);
      console.log(`OK engenharia ${largura}px`, medidas);
      await page.close();
    }
    console.log("OK seção de engenharia sem relatos fictícios ou erro de console");
  } finally {
    await browser.close();
  }
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
