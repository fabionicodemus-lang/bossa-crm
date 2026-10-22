/* Complementos locais: barras, teclado, gesto de pinça emulado, texto efetivo 200%, mídia e métricas. */
const {
    chromium,
  } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = "http://localhost:3220",
  slug = "/empreendimentos/flow-aptos",
  dir = "docs/flow/etapa3";
let b;
const out = {
  data: new Date().toISOString(),
  barra: [],
  texto: [],
  videos: [],
  limites:
    "Emulação Chromium, sem aparelho físico, teclado virtual, escuta integral ou zoom nativo.",
};
async function pos(p, sel) {
  await p
    .locator(sel)
    .first()
    .evaluate((el) =>
      scrollTo({
        top: scrollY + el.getBoundingClientRect().top - 155,
        behavior: "instant",
      }),
    );
  await p.waitForTimeout(200);
}
(async () => {
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await c.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  await c.addInitScript(() => {
    try {
      localStorage.setItem("bossa_consent", "necessarios");
    } catch {}
  });
  const p = await c.newPage();
  await p.goto(base + slug);
  await p.waitForTimeout(350);
  async function barra(estado, esperado) {
    await p.waitForTimeout(100);
    const visivel = await p.locator(".fl-barra").isVisible();
    assert.equal(visivel, esperado, estado);
    out.barra.push({ estado, visivel });
  }
  await barra("abertura", false);
  await pos(p, ".fl-opcoes");
  await barra("fora da abertura", true);
  await p.locator(".cabecalho__abrir").click();
  await barra("menu aberto", false);
  await p.locator(".cabecalho__abrir").click();
  await barra("menu fechado", true);
  await p.locator(".fl-opcoes button").nth(2).click();
  await barra("planta trocada", true);
  await p
    .getByRole("button", { name: "Ampliar planta selecionada", exact: true })
    .click();
  await barra("modal aberto", false);
  const caixa = await p.locator(".fl-visor-imagem").boundingBox(),
    cdp = await c.newCDPSession(p);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const x = caixa.x + caixa.width / 2,
    y = caixa.y + caixa.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 30, y, id: 1 },
      { x: x + 30, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 65, y, id: 1 },
      { x: x + 65, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.waitForTimeout(100);
  out.pinca = {
    metodo: "dois contatos emulados pelo CDP do Chromium",
    zoom: await p.locator("dialog output").innerText(),
  };
  assert(parseInt(out.pinca.zoom) > 100);
  await p.keyboard.press("Escape");
  await barra("modal fechado", true);
  await pos(p, "#visita");
  await barra("contato visível", false);
  await p.locator("#visita-nome").focus();
  await barra("campo focado", false);
  // Textos 200% efetivos, sem mudar DPR, transform ou largura.
  for (const estado of ["plantas", "menu", "formulario", "modal"]) {
    await p.goto(base + slug);
    await p.waitForTimeout(250);
    if (estado === "plantas") await pos(p, ".fl-opcoes");
    if (estado === "menu") await p.locator(".cabecalho__abrir").click();
    if (estado === "formulario") await pos(p, "#visita");
    if (estado === "modal")
      await p
        .getByRole("button", {
          name: "Ampliar planta selecionada",
          exact: true,
        })
        .click();
    const prova = await p.evaluate(() => {
      const els = [...document.querySelectorAll("body *")].filter(
          (e) =>
            e instanceof HTMLElement &&
            !["SCRIPT", "STYLE", "LINK"].includes(e.tagName),
        ),
        val = els.map((e) => ({
          e,
          f: parseFloat(getComputedStyle(e).fontSize),
          l: parseFloat(getComputedStyle(e).lineHeight),
        })),
        antes = getComputedStyle(document.querySelector("h1")).fontSize;
      for (const { e, f, l } of val) {
        e.style.setProperty("font-size", f * 2 + "px", "important");
        if (Number.isFinite(l))
          e.style.setProperty("line-height", l * 2 + "px", "important");
      }
      return {
        antes,
        depois: getComputedStyle(document.querySelector("h1")).fontSize,
        width: innerWidth,
        dpr: devicePixelRatio,
      };
    });
    await p.waitForTimeout(100);
    const largura = await p.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert(largura <= 390, estado + ": " + largura);
    out.texto.push({ estado, ...prova, scrollWidth: largura });
    if (estado === "modal") {
      for (const nome of ["Fechar ×", "Aproximar +", "Ajustar"]) {
        await p.getByRole("button", { name: nome, exact: true }).focus();
        const r = await p.locator(":focus").boundingBox();
        assert(r.y >= 0 && r.y + r.height <= 844, JSON.stringify({ nome, r }));
      }
    }
    await p.screenshot({ path: `${dir}/390-texto200-${estado}.png` });
  }
  // Reprodução real do arquivo no navegador; não é conferência do áudio.
  await p.goto(base + slug);
  await p.waitForTimeout(250);
  for (const video of ["unidade-1601", "obra", "augusto", "natalia"]) {
    const seletor = `.fl-vv:has(img[src*="${video === "obra" ? "poster-obra" : video === "unidade-1601" ? "poster-unidade-1601" : "poster-" + video}"])`;
    await p.locator(seletor + " button").click();
    const v = p.locator(`video[src$="/${video}.mp4"]`);
    await v.evaluate(async (el) => {
      el.muted = true;
      await el.play();
    });
    await p.waitForTimeout(450);
    const m = await v.evaluate((el) => ({
      tempo: el.currentTime,
      width: el.videoWidth,
      height: el.videoHeight,
      erro: el.error?.message || null,
    }));
    assert(m.tempo > 0 && !m.erro);
    out.videos.push({ video, ...m });
    await v.evaluate((el) => el.pause());
  }
  // Uma janela inicial local, sem throttling ou garantia de resultados em produção.
  const normal = await b.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await normal.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  await normal.addInitScript(() => {
    try {
      localStorage.setItem("bossa_consent", "necessarios");
    } catch {}
    window.__m = { cls: 0, lcp: 0 };
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => {
        if (!e.hadRecentInput) window.__m.cls += e.value;
      }),
    ).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => (window.__m.lcp = e.startTime)),
    ).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const pn = await normal.newPage();
  await pn.goto(base + slug);
  await pn.waitForTimeout(2300);
  out.inicial = await pn.evaluate(() => ({
    ...window.__m,
    bytes: performance
      .getEntriesByType("resource")
      .reduce((s, r) => s + r.transferSize, 0),
    videosBaixados: performance
      .getEntriesByType("resource")
      .filter((r) => r.name.includes(".mp4"))
      .map((r) => new URL(r.name).pathname),
    imagens: document.images.length,
    carregadas: [...document.images].filter(
      (im) => im.complete && im.naturalWidth > 0,
    ).length,
    videoPausado: document.querySelector(".fl-abertura video").paused,
  }));
  assert(!out.inicial.videoPausado);
  await pn
    .getByRole("button", { name: "Pausar vídeo de fundo", exact: true })
    .click();
  await pos(pn, ".fl-opcoes");
  await pn.evaluate(() => scrollTo(0, 0));
  await pn.waitForTimeout(200);
  assert(await pn.locator(".fl-abertura video").evaluate((v) => v.paused));
  out.pausaManualPreservada = true;
  await normal.close();
  console.log(JSON.stringify(out));
})()
  .catch((e) => {
    out.falha = String(e);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(dir + "/complementos.json", JSON.stringify(out, null, 2));
    await b?.close();
  });
