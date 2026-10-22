/* Verificação visual local: texto efetivamente ampliado 200% ou alternativa pública.
 * Capturas mantêm as barras reais. Não altera código, DPR, transform ou configurações remotas. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = process.env.BASE_URL || "http://localhost:3200";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const pasta = "docs/alma/fase4";
const publica = process.argv.includes("--publica");
const slug = "/empreendimentos/alma-seahouses";
let b;
async function pos(p, sel) {
  await p.locator(sel).evaluate((el) =>
    window.scrollTo({
      top: scrollY + el.getBoundingClientRect().top - 190,
      behavior: "instant",
    }),
  );
  await p.waitForTimeout(120);
}
async function foto(p, n) {
  await p.screenshot({ path: `${pasta}/${n}.png` });
}
async function medidas(p) {
  return p.evaluate(() => ({
    innerWidth,
    innerHeight,
    dpr: devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth,
    visualScale: visualViewport.scale,
  }));
}
async function ampliar(p) {
  return p.evaluate(() => {
    // Ler TODOS os valores antes de escrever evita dobrar herança sucessivamente em filhos.
    const elementos = [...document.querySelectorAll("body *")].filter(
      (el) =>
        el instanceof HTMLElement &&
        !["SCRIPT", "STYLE", "LINK"].includes(el.tagName),
    );
    const valores = elementos.map((el) => ({
      el,
      font: parseFloat(getComputedStyle(el).fontSize),
      linha: parseFloat(getComputedStyle(el).lineHeight),
    }));
    const provas = [
      "h1",
      ".al-h2",
      ".al-p",
      ".al-bt",
      ".cabecalho__abrir",
      ".al-nav a",
      "input",
      ".al-visor button",
    ]
      .map((sel) => {
        const el = document.querySelector(sel);
        return el
          ? { sel, el, antes: parseFloat(getComputedStyle(el).fontSize) }
          : null;
      })
      .filter(Boolean);
    valores.forEach(({ el, font, linha }) => {
      el.style.setProperty("font-size", font * 2 + "px", "important");
      if (Number.isFinite(linha))
        el.style.setProperty("line-height", linha * 2 + "px", "important");
    });
    return {
      elementos: valores.length,
      amostras: provas.map(({ sel, el, antes }) => ({
        seletor: sel,
        antes,
        depois: parseFloat(getComputedStyle(el).fontSize),
        fator: parseFloat(getComputedStyle(el).fontSize) / antes,
      })),
    };
  });
}
(async () => {
  fs.mkdirSync(pasta, { recursive: true });
  b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await c.addInitScript(() => {
    try {
      localStorage.setItem("bossa_consent", "necessarios");
    } catch {}
  });
  await c.route("**/api/eventos", (r) => r.fulfill({ json: { ok: true } }));
  await c.route("**/api/leads", (r) => r.abort("blockedbyclient"));
  const p = await c.newPage();
  const r = {
    data: new Date().toISOString(),
    base,
    variante: publica ? "pública local" : "prévia local",
    mecanismo: publica
      ? "Navegação visual na variante pública, com marcadores desativados pelo build local"
      : "Duplicação de font-size e line-height calculados de TODOS os elementos HTML antes de qualquer escrita; valores aplicados ao texto real por CSS inline de QA. Não é zoom nativo, DPR, imagem ampliada, transform ou redução de viewport.",
    estados: [],
  };
  if (publica) {
    for (const width of [1440, 390, 320]) {
      await p.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await p.goto(base + slug);
      await p.waitForTimeout(180);
      assert.equal(await p.locator("[data-midia]").count(), 0);
      assert.equal(
        await p
          .getByText("Material a produzir e aprovar", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await p.locator("#apartamentos img[src*=living]").count(),
        1,
      );
      assert.equal(
        await p
          .getByText("Conheça as plantas de 103 e 114 m²", { exact: true })
          .count(),
        0,
      );
      for (const id of [
        "inicio",
        "apartamentos",
        "plantas",
        "posicao",
        "lazer",
        "localizacao",
        "conforto",
        "obra",
        "duvidas",
        "contato",
      ]) {
        await pos(p, "#" + id);
        const m = await medidas(p);
        assert(m.scrollWidth <= m.innerWidth, JSON.stringify(m));
        r.estados.push({ width, secao: id, ...m });
        if (
          ["apartamentos", "posicao", "conforto", "obra", "contato"].includes(
            id,
          )
        ) {
          await p.locator("#" + id + " img").evaluateAll((ims) =>
            Promise.all(
              ims.map((i) => {
                if (i.getBoundingClientRect().top < innerHeight)
                  return i.decode().catch(() => {});
              }),
            ),
          );
          await foto(p, `publica-${width}-${id}`);
        }
      }
      await p
        .getByRole("button", { name: "Comparar as quatro opções", exact: true })
        .click();
      await p
        .locator(".al-comparacao article")
        .nth(1)
        .getByRole("button", { name: "Ver esta planta", exact: true })
        .click();
      await p.waitForFunction(() => document.title.includes("114"));
      assert(
        decodeURIComponent(
          await p
            .locator(".al-planta-painel a[target=_blank]")
            .getAttribute("href"),
        ).includes("114 m²"),
      );
    }
  } else {
    for (const width of [390, 320])
      for (const estado of [
        "abertura",
        "menu",
        "plantas",
        "comparacao",
        "formulario",
        "modal",
      ]) {
        await p.setViewportSize({ width, height: 844 });
        await p.goto("about:blank");
        await p.goto(base + slug);
        await p.waitForTimeout(180);
        if (estado === "menu") await p.locator(".cabecalho__abrir").click();
        if (["plantas", "comparacao", "modal"].includes(estado)) {
          await p.locator(".al-opcoes button").nth(3).click();
          if (estado === "comparacao")
            await p
              .getByRole("button", {
                name: "Comparar as quatro opções",
                exact: true,
              })
              .click();
          if (estado === "modal")
            await p
              .locator(".al-planta-painel")
              .getByRole("button", { name: "Ampliar planta", exact: true })
              .last()
              .click();
        }
        if (estado === "formulario") {
          await p
            .getByRole("button", {
              name: "Prefiro receber um contato",
              exact: true,
            })
            .click();
          await p
            .getByRole("button", {
              name: "Registrar meu interesse",
              exact: true,
            })
            .click();
        }
        const antes = await medidas(p);
        if (estado === "abertura") await foto(p, `texto100-${width}-abertura`);
        const prova = await ampliar(p);
        assert(prova.amostras.every((x) => Math.abs(x.fator - 2) < 0.001));
        const depois = await medidas(p);
        assert.equal(depois.innerWidth, antes.innerWidth);
        assert.equal(depois.innerHeight, antes.innerHeight);
        assert.equal(depois.dpr, antes.dpr);
        assert(
          depois.scrollWidth <= depois.innerWidth,
          `${estado} ${JSON.stringify(depois)}`,
        );
        if (estado === "plantas") {
          await p.locator('.al-nav a[href="#plantas"]').click();
          await p.waitForTimeout(100);
          const t = await p
            .locator("#plantas h2")
            .evaluate((el) => el.getBoundingClientRect().top);
          const n = await p
            .locator(".al-nav")
            .evaluate((el) => el.getBoundingClientRect().bottom);
          assert(t >= n, `${width}: âncora ${t}, barras ${n}`);
        }
        if (estado === "comparacao") await pos(p, "#al-comparacao");
        if (estado === "formulario") {
          await pos(p, ".al-form");
          await foto(p, `texto200-${width}-formulario-topo`);
          await pos(p, ".consentimento");
        }
        if (estado === "modal") {
          assert.equal(await p.locator("dialog").count(), 1);
          await p
            .getByRole("button", { name: "Aproximar +", exact: true })
            .click();
          assert.equal(await p.locator("dialog output").innerText(), "150%");
          // Com texto maior, o diálogo pode rolar verticalmente. Cada controle deve
          // continuar alcançável, sem exigir que todos caibam simultaneamente na tela.
          prova.controles = [];
          for (const nome of [
            "Aproximar +",
            "Reduzir −",
            "Ajustar",
            "Fechar ×",
          ]) {
            const controle = p.getByRole("button", { name: nome, exact: true });
            await controle.focus();
            const rect = await controle.evaluate((el) =>
              el.getBoundingClientRect().toJSON(),
            );
            assert(
              rect.top >= 0 && rect.bottom <= 844,
              `${nome}: ${JSON.stringify(rect)}`,
            );
            prova.controles.push({ nome, top: rect.top, bottom: rect.bottom });
            if (nome === "Ajustar") await controle.click();
            if (nome === "Ajustar")
              await foto(p, `texto200-${width}-modal-controles`);
          }
          await p.locator("dialog img").evaluate((im) => im.decode());
        }
        await foto(p, `texto200-${width}-${estado}`);
        if (estado === "menu") {
          await p.locator("#menu-cel a").last().focus();
          const ultimo = await p
            .locator("#menu-cel a")
            .last()
            .evaluate((el) => el.getBoundingClientRect().toJSON());
          assert(ultimo.bottom <= 844 && ultimo.top >= 73);
          prova.ultimoLinkMenu = { top: ultimo.top, bottom: ultimo.bottom };
          await foto(p, `texto200-${width}-menu-final`);
        }
        r.estados.push({ width, estado, antes, depois, prova });
        if (estado === "modal") {
          await p.keyboard.press("Escape");
          assert.equal(await p.locator("dialog").count(), 0);
        }
      }
  }
  fs.writeFileSync(
    `${pasta}/${publica ? "publica-visual" : "texto200"}-verificacao.json`,
    JSON.stringify(r, null, 2),
  );
  console.log({
    variante: r.variante,
    estados: r.estados.length,
    mecanismo: r.mecanismo,
  });
  await b.close();
})().catch(async (e) => {
  console.error(e);
  if (b) await b.close();
  process.exit(1);
});
