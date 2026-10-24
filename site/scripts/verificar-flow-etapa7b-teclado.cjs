/* Verificação local de teclado/zoom, APIs interceptadas. */
const {
  chromium,
} = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
let b;
const out = {
  metodo:
    "Chromium emulado 390×844 CSS px; teclado via Playwright; sem aparelho físico.",
};
(async () => {
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await c.addInitScript(() =>
    localStorage.setItem("bossa_consent", "necessarios"),
  );
  await c.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  const p = await c.newPage();
  await p.goto("http://localhost:3220/empreendimentos/flow-aptos");
  await p.locator(".fl-opcoes button").first().focus();
  await p.keyboard.press("ArrowRight");
  assert.equal(
    await p
      .locator(".fl-opcoes button[aria-pressed=true]")
      .getAttribute("data-planta"),
    "tipo-3",
  );
  await p.keyboard.press("ArrowLeft");
  assert.equal(
    await p
      .locator(".fl-opcoes button[aria-pressed=true]")
      .getAttribute("data-planta"),
    "tipo-2",
  );
  out.plantas = "ArrowRight/ArrowLeft: seleção e foco preservados";
  await p.locator(".fl-move-seletor select").focus();
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForFunction(
    () => document.querySelector(".fl-move-seletor select").value === "1",
  );
  assert.match(await p.locator("#fl-move-foto").innerText(), /Coworking/);
  out.move = "ArrowDown/Enter: imagem coworking";
  await p.locator(".fl-vista-seletor select").selectOption("13");
  await p.locator(".fl-vista-seletor select").focus();
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForFunction(
    () => document.querySelector(".fl-vista-seletor select").value === "15",
  );
  await p.waitForFunction(() =>
    decodeURIComponent(
      document.querySelector(".fl-vista-rodape a").href,
    ).includes("15º"),
  );
  out.vistas = "ArrowDown/Enter: 15º e contato coerentes";
  await p.locator(".fl-opcoes button").nth(2).click();
  const acionador = p.getByRole("button", {
    name: "Ampliar planta selecionada",
    exact: true,
  });
  await acionador.click();
  for (let i = 0; i < 6; i++)
    await p.getByRole("button", { name: "Aproximar +", exact: true }).click();
  assert.equal(await p.locator("dialog output").innerText(), "400%");
  await p.locator("dialog img").evaluate((im) => im.decode());
  out.zoom = await p.locator("dialog img").evaluate((im) => ({
    atual: im.currentSrc,
    naturalWidth: im.naturalWidth,
    naturalHeight: im.naturalHeight,
    objectFit: getComputedStyle(im).objectFit,
  }));
  assert.match(out.zoom.atual, /tipo1-73m2.webp/);
  assert(Number(new URL(out.zoom.atual).searchParams.get("w")) >= 1536);
  assert.equal(out.zoom.objectFit, "contain");
  await p.screenshot({
    path: "docs/flow/etapa7b/390-tipo1-zoom400.jpg",
    quality: 85,
  });
  await p.keyboard.press("Escape");
  assert.equal(
    await p.locator(":focus").getAttribute("aria-label"),
    "Ampliar planta selecionada",
  );
  out.retornoFoco = true;
  console.log(JSON.stringify(out));
})()
  .catch((e) => {
    out.falha = String(e);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(
      "docs/flow/etapa7b/teclado.json",
      JSON.stringify(out, null, 2),
    );
    await b?.close();
  });
