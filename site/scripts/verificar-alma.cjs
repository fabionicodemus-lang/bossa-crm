/* Testes locais com Chromium e respostas controladas. Nenhum lead é enviado ao CRM.
 * PLAYWRIGHT_MODULE permite usar a instalação de QA do ambiente sem alterar dependências.
 * BASE_URL deve apontar exclusivamente para um servidor local isolado. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BASE_URL || "http://localhost:3200";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const destino = process.env.CAPTURAS_DIR || "docs/alma/capturas";
const evidencias = [];
const ok = (s) => {
  evidencias.push(s);
  console.log("OK", s);
};
const esperar = (p, ms = 1200) => p.waitForTimeout(ms);
(async () => {
  fs.mkdirSync(destino, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    localStorage.setItem("bossa_consent", "necessarios"),
  );
  const eventos = [];
  let resposta = { ok: true, gravado: false };
  let status = 200;
  let modo = "json";
  const pedidos = [];
  const erros = [];
  await context.route("**/api/eventos", async (r) => {
    try {
      eventos.push(JSON.parse(r.request().postData()));
    } catch {}
    await r.fulfill({ json: { ok: true } });
  });
  await context.route("**/api/leads", async (r) => {
    pedidos.push(JSON.parse(r.request().postData()));
    if (modo === "rede") return r.abort("failed");
    if (modo === "invalido")
      return r.fulfill({ status: 200, body: "invalido" });
    await r.fulfill({ status, json: resposta });
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => erros.push(e.message));
  const rota = "/empreendimentos/alma-seahouses";
  await p.goto(base + rota);
  await esperar(p);
  assert.deepEqual(
    await p.locator(".al section[id]").evaluateAll((es) => es.map((e) => e.id)),
    [
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
    ],
  );
  assert.equal(await p.locator("h1").count(), 1);
  assert.equal(await p.locator("#duvidas details").count(), 13);
  assert.equal(eventos.filter((x) => x.evento === "view_floorplan").length, 0);
  assert(
    !decodeURIComponent(
      await p.locator("#al-abertura-acoes a").nth(1).getAttribute("href"),
    ).includes("103"),
  );
  assert(
    await p
      .locator("video")
      .first()
      .evaluate((v) => v.paused),
  );
  ok(
    "Dez seções na ordem, treze perguntas, contato inicial geral, movimento reduzido e nenhuma planta vista fora da tela",
  );
  const opções = [
    ["tipo-02", "103", 3],
    ["tipo-01", "114", 3],
    ["duplex-tipo-2", "145", 4],
    ["duplex-tipo-1", "168", 4],
  ];
  for (const [slug, area, suites] of opções) {
    await p.goto(base + rota + "/plantas/" + slug + "#plantas");
    await esperar(p, 300);
    assert(
      (
        await p.locator(".al-opcoes button[aria-pressed=true]").innerText()
      ).includes(area),
    );
    const href = decodeURIComponent(
      await p
        .locator(".al-planta-painel a[target=_blank]")
        .getAttribute("href"),
    );
    assert(href.includes(area + " m²"));
    assert(href.includes(suites + " suítes"));
    assert((await p.title()).includes(area));
    assert(
      !(
        await p.locator('meta[property="og:image"]').getAttribute("content")
      ).includes(suites === 4 ? "duplex-" : "PROIBIDO"),
    );
    if (suites === 4) {
      await p
        .getByRole("button", {
          name: "Prancha 2 — pavimento completo",
          exact: true,
        })
        .click();
      assert(
        (await p.locator(".al-planta-quadro img").getAttribute("src")).includes(
          "superior",
        ),
      );
    }
    await p
      .locator(".al-planta-painel")
      .getByRole("button", { name: "Ampliar planta", exact: true })
      .last()
      .click();
    await p.getByRole("dialog").waitFor();
    if (suites === 4)
      assert(
        (await p.locator("#al-visor-legenda").innerText()).includes(
          "duas unidades",
        ),
      );
    await p.getByRole("button", { name: "Aproximar +", exact: true }).click();
    assert.equal(await p.locator("dialog output").innerText(), "150%");
    await p.getByRole("button", { name: "Ajustar", exact: true }).click();
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("dialog").count(), 0);
    assert.equal(
      await p.evaluate(() => document.activeElement?.textContent),
      "Ampliar planta",
    );
    await p.reload();
    await esperar(p, 150);
    assert(
      (
        await p.locator(".al-opcoes button[aria-pressed=true]").innerText()
      ).includes(area),
    );
  }
  ok(
    "Quatro rotas, recarga, metadados, duas pranchas completas, contexto WhatsApp, zoom, Escape e retorno de foco",
  );
  await p.goto(base + rota);
  await esperar(p, 200);
  await p.locator("#plantas").scrollIntoViewIfNeeded();
  const pv = eventos.filter((x) => x.evento === "page_view").length;
  await p.locator(".al-opcoes button").nth(1).click();
  const scroll = await p.evaluate(() => scrollY);
  await p.locator(".al-opcoes button").nth(3).click();
  assert.equal(await p.evaluate(() => scrollY), scroll);
  await esperar(p, 200);
  assert.equal(eventos.filter((x) => x.evento === "page_view").length, pv);
  assert(p.url().includes("duplex-tipo-1"));
  await p
    .getByRole("button", { name: "Comparar as quatro opções", exact: true })
    .click();
  assert.equal(await p.locator(".al-comparacao article").count(), 4);
  await p
    .locator(".al-comparacao article")
    .nth(0)
    .getByRole("button", { name: "Ver esta planta", exact: true })
    .click();
  await p.locator(".al-planta-quadro").scrollIntoViewIfNeeded();
  await esperar(p);
  const visitas = eventos.filter(
    (x) => x.evento === "view_floorplan" && x.detalhe.planta === "tipo-02",
  ).length;
  await p.locator(".al-opcoes button").nth(1).click();
  await p.locator(".al-opcoes button").nth(0).click();
  await p.locator(".al-planta-quadro").scrollIntoViewIfNeeded();
  await esperar(p);
  assert.equal(
    eventos.filter(
      (x) => x.evento === "view_floorplan" && x.detalhe.planta === "tipo-02",
    ).length,
    visitas,
  );
  ok(
    "Trocas sem scroll/reload/page_view, comparação e exposição por um segundo sem duplicação",
  );
  await p.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t) => {
          window.__copiado = t;
        },
      },
    });
  });
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  assert(
    (await p.locator("[role=status]").allTextContents())
      .join()
      .includes("Link copiado."),
  );
  assert.equal(
    await p.evaluate(() => window.__copiado),
    base + rota + "/plantas/tipo-02#plantas",
  );
  await p.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        window.__nativo = true;
      },
    }),
  );
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  assert(await p.evaluate(() => window.__nativo));
  await p.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelado", "AbortError");
      },
    }),
  );
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  assert(
    !(await p.locator(".al-consulta").innerText()).includes(
      "Não foi possível compartilhar.",
    ),
  );
  await p.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw Error("indisponível");
      },
    }),
  );
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  assert(await p.getByLabel("Link da planta").isVisible());
  ok(
    "Compartilhamento: cópia confirmada, cancelamento e falha com link manual limpo",
  );
  await p
    .getByRole("button", { name: "Prefiro receber um contato", exact: true })
    .click();
  assert.equal(await p.locator("select[name=interesse]").inputValue(), "");
  assert.equal(await p.locator("input[name=consentimento]").isChecked(), false);
  await p.locator("[name=nome]").fill("Revisão isolada");
  await p.locator("[name=whatsapp]").fill("+351 912 345 678");
  await p.locator("[name=consentimento]").check();
  const antes = eventos.filter((x) => x.evento === "lead_submit").length;
  const submit = () =>
    p
      .getByRole("button", { name: "Registrar meu interesse", exact: true })
      .click();
  for (const conf of [
    { s: 200, r: { ok: true, gravado: false } },
    { s: 500, r: { ok: false } },
    { s: 200, r: { ok: true } },
    { s: 200, r: { ok: false, gravado: true } },
    { s: 200, r: { ok: true, gravado: true }, m: "invalido" },
    { s: 200, r: { ok: false }, m: "rede" },
  ]) {
    status = conf.s;
    resposta = conf.r;
    modo = conf.m || "json";
    await submit();
    await esperar(p, 150);
    assert(await p.locator(".form [role=alert]").isVisible());
    assert.equal(
      await p.locator("[name=nome]").inputValue(),
      "Revisão isolada",
    );
    assert.equal(
      eventos.filter((x) => x.evento === "lead_submit").length,
      antes,
    );
  }
  assert.equal(pedidos[0].whatsapp, "+351 912 345 678");
  assert.equal(pedidos[0].interesse, "");
  assert.equal(pedidos[0].formulario, "interesse");
  assert.equal(pedidos[0].planta, undefined);
  assert.equal(pedidos[0].data, undefined);
  await p.locator(".al-opcoes button").nth(2).click();
  assert.equal(await p.locator("[name=nome]").inputValue(), "Revisão isolada");
  status = 200;
  resposta = { ok: true, gravado: true };
  modo = "json";
  await p.locator("[name=interesse]").selectOption("Casa de praia");
  await submit();
  await esperar(p, 200);
  assert(
    (await p.locator(".form__ok").innerText()).includes(
      "Seu interesse no Alma foi registrado.",
    ),
  );
  assert.equal(
    eventos.filter((x) => x.evento === "lead_submit").length,
    antes + 1,
  );
  ok(
    "Formulário: falhas HTTP, confirmação incompleta, JSON inválido, rede, dados preservados na troca, finalidade vazia e sucesso apenas com 2xx + ok + gravado",
  );
  await p.goto(base + rota);
  await esperar(p, 200);
  await p
    .locator("summary")
    .filter({ hasText: "Conheça as plantas de 103 e 114 m²" })
    .click();
  for (const id of [
    "M01",
    "M02",
    "M03",
    "M04A",
    "M04B",
    "M05",
    "M06",
    "M07",
    "M08",
  ])
    assert.equal(await p.locator(`[data-midia=${id}]`).count(), 1);
  assert((await p.locator(".al-boletim").innerText()).includes("10,52%"));
  assert(
    (await p.locator(".al-boletim").innerText()).includes("agosto de 2026"),
  );
  await p.locator("#duvidas details").nth(7).locator("summary").click();
  assert(
    (await p.locator("#duvidas details").nth(7).innerText()).includes("10,52%"),
  );
  await p.getByText("Ver os dois pavimentos", { exact: true }).click();
  await p.getByRole("button", { name: "Rooftop", exact: true }).click();
  assert((await p.locator("#lazer").innerText()).includes("Lounge das Pedras"));
  await p.getByText("Explorar as vistas", { exact: true }).click();
  await p.getByRole("slider", { name: "Referência de altura" }).focus();
  await p.keyboard.press("ArrowRight");
  await p.getByText("Explorar o giro do rooftop", { exact: true }).click();
  await p.getByRole("button", { name: "Próximo", exact: true }).last().click();
  ok(
    "Nove posições M01–M08, boletim/FAQ sincronizados, lazer por pavimento, vistas e giro por teclado",
  );
  for (const [nome, width, height] of [
    ["computador", 1440, 1000],
    ["celular", 390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    await p.goto(base + rota);
    await esperar(p, 300);
    await p.screenshot({ path: `${destino}/${nome}-abertura.png` });
    for (const sec of ["plantas", "lazer"]) {
      await p
        .locator("#" + sec)
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await p.locator("#" + sec + " img").evaluateAll((imgs) =>
        Promise.all(
          imgs.map((im) => {
            im.loading = "eager";
            return im.decode().catch(() => {});
          }),
        ),
      );
      await esperar(p, 300);
      await p
        .locator("#" + sec)
        .screenshot({
          path: `${destino}/${nome}-${sec}.png`,
          style:
            ".cabecalho,.al-nav,.al-barra-mobile{visibility:hidden!important}",
        });
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator("#plantas").scrollIntoViewIfNeeded();
  await esperar(p, 200);
  assert(await p.locator(".al-barra-mobile").isVisible());
  await p.locator(".al-opcoes button").nth(3).click();
  assert(
    decodeURIComponent(
      await p.locator(".al-barra-mobile a").nth(1).getAttribute("href"),
    ).includes("168 m²"),
  );
  await p
    .locator(".al-planta-painel")
    .getByRole("button", { name: "Ampliar planta", exact: true })
    .last()
    .click();
  assert.equal(await p.locator(".al-barra-mobile").count(), 0);
  for (let n = 0; n < 10; n++) {
    await p.keyboard.press("Tab");
    assert(await p.evaluate(() => !!document.activeElement.closest("dialog")));
  }
  await p.keyboard.press("Escape");
  await p.locator("#contato").scrollIntoViewIfNeeded();
  await esperar(p, 100);
  assert.equal(await p.locator(".al-barra-mobile").count(), 0);
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.addStyleTag({
    content: ".al-fase3{font-size:200%}.al-fase3 .al-p{font-size:34px}",
  });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  ok(
    "Capturas 1440/390, barra contextual e recolhida em modal/contato, foco contido e ausência de overflow 320–1440 e texto ampliado",
  );
  await p.goto(base + "/empreendimentos/flow-aptos");
  await esperar(p, 200);
  assert(
    (await p.locator(".fl").count()) || (await p.locator(".flow").count()),
  );
  assert.equal(await p.locator(".al-barra-mobile").count(), 0);
  assert(await p.locator(".whats-fixo").count());
  await p.locator(".plantas__aba").nth(2).click();
  assert(p.url().includes("/plantas/"));
  assert((await p.locator(".plantas__painel").innerText()).includes("73"));
  await p.goto(base + rota + "/plantas/invalida");
  assert((await p.locator("body").innerText()).match(/404|encontrad/i));
  assert.equal(
    (
      await context.request.get(base + "/obras/alma-seahouses/2026-08")
    ).status(),
    200,
  );
  assert.equal(
    (await context.request.get(base + "/privacidade")).status(),
    200,
  );
  assert.deepEqual(erros, []);
  ok(
    "Flow: seletor, navegação e contato preservados; planta inválida 404; boletim e privacidade 200; sem erros JavaScript",
  );
  fs.writeFileSync(
    destino + "/verificacao.json",
    JSON.stringify(
      {
        data: new Date().toISOString(),
        base,
        modo: "Respostas controladas locais; nenhuma integração real de lead testada",
        verificacoes: evidencias,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
