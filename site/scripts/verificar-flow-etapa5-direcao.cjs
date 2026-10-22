/* Apenas Chromium/localhost; APIs interceptadas, sem leads ou mensagens reais. */
const {
  chromium,
} = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const dir = "docs/flow/etapa5",
  base = "http://localhost:3220/empreendimentos/flow-aptos";
const out = {
  metodo:
    "Chromium local, viewports CSS reais; sem aparelho físico/teclado virtual. APIs bloqueadas por interceptação.",
  alturas: [],
  composicao: [],
  compartilhar: [],
  performance: [],
};
let b;
async function pos(p, s) {
  await p
    .locator(s)
    .first()
    .evaluate((el) =>
      scrollTo({
        top: scrollY + el.getBoundingClientRect().top - 155,
        behavior: "instant",
      }),
    );
  await p.waitForTimeout(150);
}
async function foto(p, n) {
  await p.locator("img").evaluateAll(async (ims) =>
    Promise.all(
      ims
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0;
        })
        .map((im) =>
          Promise.race([
            im.decode().catch(() => {}),
            new Promise((r) => setTimeout(r, 2000)),
          ]),
        ),
    ),
  );
  await p.screenshot({ path: `${dir}/${n}.jpg`, quality: 85 });
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
  await c.addInitScript(() =>
    localStorage.setItem("bossa_consent", "necessarios"),
  );
  const p = await c.newPage();
  await p.goto(base);
  await p.evaluate(() => document.fonts.ready);
  // Andar comum preservado nas 3 direções; ausência comunicada, sem associação por índice.
  await p
    .locator(".fl-andares button")
    .getByText("13º", { exact: true })
    .click();
  for (const d of [1, 2, 0]) {
    await p.locator(".fl-abas button").nth(d).click();
    assert((await p.locator(".fl-vista__andar").innerText()).startsWith("13º"));
    out.alturas.push({
      direcao: d,
      altura: 13,
      aviso: await p.locator(".fl-vista-aviso").innerText(),
    });
  }
  await p
    .locator(".fl-andares button")
    .getByText("20º", { exact: true })
    .click();
  await p.locator(".fl-abas button").nth(2).click();
  assert.match(
    await p.locator(".fl-vista-aviso").innerText(),
    /Não há foto do 20º.*Exibindo o 19º/,
  );
  out.alturas.push({
    direcao: 2,
    altura: 19,
    aviso: await p.locator(".fl-vista-aviso").innerText(),
  });
  assert(
    (await p.locator(".fl-vista__tela img").getAttribute("src")).includes(
      "b-03",
    ),
  );
  await p.locator(".fl-abas button").nth(0).click();
  await p
    .locator(".fl-andares button")
    .getByText("RT", { exact: true })
    .click();
  await p.locator(".fl-abas button").nth(2).click();
  assert.match(await p.locator(".fl-vista__andar").innerText(), /24º/);
  assert.equal(await p.locator(".fl-vista-aviso").innerText(), "");
  await p
    .locator(".fl-andares button")
    .getByText("13º", { exact: true })
    .click();
  await p
    .getByRole("button", { name: "Comparar duas alturas", exact: true })
    .click();
  await p.locator("#fl-comparar-alturas select").selectOption("19");
  const fotos = await p.locator(".fl-comparar-foto img").evaluateAll((ims) =>
    ims.map((i) => ({
      src: decodeURIComponent(i.getAttribute("src")),
      alt: i.alt,
    })),
  );
  assert.equal(fotos.length, 2);
  assert(fotos.every((x) => x.src.includes("/vista/b-")));
  out.comparacao = fotos;
  await p.locator("#fl-andar").focus();
  await p.keyboard.press("ArrowRight");
  assert.match(await p.locator(".fl-vista__andar").innerText(), /15º/);
  const msg = decodeURIComponent(
    await p
      .locator("#visita .fl-form-comercial a[target=_blank]")
      .getAttribute("href"),
  );
  assert.match(msg, /15º.*pavimento/);
  assert.match(msg, /morros/);
  assert.match(msg, /wa.me\/554792889395/);
  out.contextoContato = msg;
  // Modo do formulário preserva campos e continua geral no contrato.
  await p.locator("#visita-nome").fill("Revisão local");
  await p
    .getByRole("button", {
      name: "Prefiro solicitar a apresentação do Flow",
      exact: true,
    })
    .click();
  await p.locator("#book-nome").fill("Material local");
  await p
    .getByRole("button", { name: "Voltar ao pedido de visita", exact: true })
    .click();
  assert.equal(await p.locator("#visita-nome").inputValue(), "Revisão local");
  await p
    .getByRole("button", {
      name: "Prefiro solicitar a apresentação do Flow",
      exact: true,
    })
    .click();
  assert.equal(await p.locator("#book-nome").inputValue(), "Material local");
  out.alternanciaFormulario = "campos preservados";
  // Falha/cancelamento nativos são simulados; clipboard real consta na matriz principal.
  for (const mode of ["cancelar", "falhar", "sucesso"]) {
    await p.evaluate((m) => {
      navigator.share = async () => {
        if (m === "cancelar") throw new DOMException("Cancelado", "AbortError");
        if (m === "falhar") throw new Error("Falha simulada");
      };
    }, mode);
    await p.locator(".fl-opcoes button").first().click();
    await p
      .getByRole("button", { name: "Compartilhar planta", exact: true })
      .click();
    const txt = await p.locator("#fl-planta-painel [role=status]").innerText();
    assert(
      mode === "cancelar"
        ? txt === ""
        : mode === "falhar"
          ? txt.includes("Copie")
          : txt.includes("concluído"),
    );
    out.compartilhar.push({
      mode,
      resultado: txt,
      metodo: "navigator.share simulado; nenhum destinatário",
    });
  }
  // Escala visual e capturas novas das imagens, controles e formulário.
  for (const width of [360, 390, 768, 1024, 1440]) {
    await p.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await p.goto(base);
    await p.evaluate(() => document.fonts.ready);
    for (const [sel, n] of [
      [".fl-roof-editorial", "piscina"],
      [".fl-move-editorial", "move-ambiente"],
      [".fl-opcoes", "seletor"],
      [".fl-form-comercial", "formulario"],
      ["#duplex > .fl-wrap > .fl-figura", "duplex-render"],
    ]) {
      await pos(p, sel);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await foto(p, `${width}-${n}`);
    }
    const medidas = await p
      .locator(
        ".fl-roof-editorial > figure .fl-imagem,.fl-move-editorial .fl-imagem",
      )
      .evaluateAll((es) =>
        es.map((e) => ({
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
        })),
      );
    assert(medidas[0].width >= width * 0.85);
    assert(medidas[1].width >= (width > 860 ? width * 0.55 : width * 0.85));
    out.composicao.push({ width, medidas });
    await pos(p, "#vistas");
    await p
      .getByRole("button", { name: "Comparar duas alturas", exact: true })
      .click();
    await pos(p, "#fl-comparar-alturas");
    await foto(p, `${width}-comparacao-alturas`);
    if (width <= 768) {
      await p.locator("#fl-explorar").click();
      await foto(p, `${width}-navegacao`);
      assert.equal(await p.locator(".fl-barra").isVisible(), false);
      await p.keyboard.press("Escape");
    }
    if (width === 390) {
      await pos(p, ".fl-duplex-escolhas");
      await p.locator(".fl-duplex-escolhas button").nth(1).click();
      assert.match(
        await p.locator(".fl-duplex-editorial article:visible").innerText(),
        /117,7/,
      );
      await foto(p, "390-duplex-opcao117");
    }
  }
  // Banner real de primeiro acesso (sem ocultar controles para a evidência).
  const cc = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await cc.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  const pc = await cc.newPage();
  await pc.goto(base);
  await pc.evaluate(() => document.fonts.ready);
  await pc.waitForTimeout(200);
  out.cookies = await pc.evaluate(() => {
    const c = document.querySelector(".cookies").getBoundingClientRect(),
      a = document.querySelector(".fl-abertura-acoes").getBoundingClientRect();
    return {
      cookies: { top: c.top, height: c.height },
      acoes: { top: a.top, bottom: a.bottom },
      sobreposicao:
        c.top < a.bottom &&
        c.bottom > a.top &&
        c.left < a.right &&
        c.right > a.left,
    };
  });
  await foto(pc, "1440-primeiro-acesso-cookies");
  await cc.close();
  // Três navegações locais, contextos novos, sem throttling: números exploratórios, não Lighthouse/CWV de campo.
  for (let i = 0; i < 3; i++) {
    const cx = await b.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
    });
    await cx.route("**/api/**", (r) =>
      r.fulfill({ json: { ok: true, gravado: false } }),
    );
    await cx.addInitScript(() => {
      localStorage.setItem("bossa_consent", "necessarios");
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
    const pp = await cx.newPage();
    await pp.goto(base);
    await pp.waitForTimeout(2300);
    out.performance.push(
      await pp.evaluate(() => ({
        ...window.__m,
        bytes: performance
          .getEntriesByType("resource")
          .reduce((s, r) => s + r.transferSize, 0),
        videos: performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes(".mp4"))
          .map((r) => new URL(r.name).pathname),
      })),
    );
    await cx.close();
  }
  const sd = await b.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await sd.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
    }),
  );
  await sd.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  const ps = await sd.newPage();
  await ps.goto(base);
  await ps.waitForTimeout(500);
  out.saveData = await ps.evaluate(() => ({
    pausado: document.querySelector(".fl-abertura video").paused,
    mp4: performance
      .getEntriesByType("resource")
      .filter((r) => r.name.includes(".mp4")).length,
  }));
  assert(out.saveData.pausado);
  assert.equal(out.saveData.mp4, 0);
  await sd.close();
  console.log(JSON.stringify(out));
})()
  .catch((e) => {
    out.falha = String(e);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(`${dir}/direcao.json`, JSON.stringify(out, null, 2));
    await b?.close();
  });
