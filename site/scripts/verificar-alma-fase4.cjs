/* Fase 4: navegador local, viewports reais, controles visíveis e respostas de lead interceptadas.
 * Não aponta para ambientes remotos nem envia mensagens/leads reais. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BASE_URL || "http://localhost:3200";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const pasta = process.env.EVIDENCIAS_DIR || "docs/alma/fase4";
fs.mkdirSync(pasta, { recursive: true });
const slug = "/empreendimentos/alma-seahouses";
const opcoes = [
  ["tipo-02", "103", "Alma Sea Houses: 103 m², 3 suítes | Bossa"],
  ["tipo-01", "114", "Alma Sea Houses: 114 m², 3 suítes | Bossa"],
  ["duplex-tipo-2", "145", "Alma Sea Houses: duplex de 145 m² | Bossa"],
  ["duplex-tipo-1", "168", "Alma Sea Houses: duplex de 168 m² | Bossa"],
];
const secoes = [
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
];
const resultado = {
  data: new Date().toISOString(),
  base,
  modo: "Chromium local; emulação móvel por viewport CSS, sem aparelho físico ou teclado virtual",
  r01: [],
  r02: [],
  mobile: [],
  barra: [],
  formulario: [],
  compartilhamento: {},
  erros: [],
};
let navegador;
const pausa = (p, n = 100) => p.waitForTimeout(n);
async function enquadrar(p, seletor) {
  await p.locator(seletor).evaluate((el) =>
    window.scrollTo({
      top: el.getBoundingClientRect().top + scrollY - 155,
      behavior: "instant",
    }),
  );
  await pausa(p);
}
async function foto(p, n) {
  await p.screenshot({ path: `${pasta}/${n}.png` });
}
async function semOverflow(p) {
  const m = await p.evaluate(() => ({
    innerWidth,
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(m.scrollWidth <= m.innerWidth, JSON.stringify(m));
  return m;
}
async function titulo(p, t) {
  await p.waitForFunction((t) => document.title === t, t);
}
async function medidasForm(p) {
  return p.locator(".al-contato-final .al-form").evaluate((el) => {
    const r = el.getBoundingClientRect(),
      b = el.querySelector("button").getBoundingClientRect(),
      c = getComputedStyle(el);
    return {
      largura: r.width,
      altura: r.height,
      controle: b.height,
      vazio: r.height - b.height,
      paddingTop: c.paddingTop,
      paddingBottom: c.paddingBottom,
      alignSelf: c.alignSelf,
    };
  });
}
async function main() {
  navegador = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const c = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await c.addInitScript(() => {
    try {
      localStorage.setItem("bossa_consent", "necessarios");
    } catch {}
  });
  const eventos = [];
  let resposta = { ok: true, gravado: false },
    http = 200,
    rede = false;
  let envios = 0;
  await c.route("**/api/eventos", async (r) => {
    eventos.push(JSON.parse(r.request().postData()));
    await r.fulfill({ json: { ok: true } });
  });
  await c.route("**/api/leads", (r) => {
    envios++;
    return rede
      ? r.abort("failed")
      : r.fulfill({ status: http, json: resposta });
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => resultado.erros.push(e.message));
  await p.goto("about:blank");
  await p.goto(base + slug);
  await titulo(p, "Alma Sea Houses em Perequê | Bossa Empreendimentos");
  await p
    .getByRole("button", { name: "Prefiro receber um contato", exact: true })
    .click();
  await p.locator("[name=nome]").fill("Revisão local");
  await p.locator("#conforto .al-expansao summary").click();
  await enquadrar(p, ".al-opcoes");
  const scroll = await p.evaluate(() => scrollY);
  const paginas = eventos.filter((e) => e.evento === "page_view").length;
  await p.locator(".al-opcoes button").nth(0).click();
  await titulo(p, opcoes[0][2]);
  assert.equal(await p.evaluate(() => scrollY), scroll);
  assert.equal(await p.locator("[name=nome]").inputValue(), "Revisão local");
  assert(await p.locator("#conforto details").evaluate((e) => e.open));
  assert.equal(eventos.filter((e) => e.evento === "page_view").length, paginas);
  resultado.r01.push({
    origem: "página geral",
    padrao: "título geral preservado antes de ação",
    selecionada: "103",
    titulo: await p.title(),
    scrollPreservado: true,
    formularioPreservado: true,
    expansaoPreservada: true,
  });
  for (const [origem] of opcoes) {
    await p.goto("about:blank");
    await p.goto(base + slug + "/plantas/" + origem + "#plantas");
    await pausa(p, 150);
    await p
      .getByRole("button", { name: "Prefiro receber um contato", exact: true })
      .click();
    await p.locator("[name=nome]").fill("Revisão local");
    await p.locator("#conforto .al-expansao summary").click();
    const views = eventos.filter((e) => e.evento === "page_view").length;
    for (const caminho of ["seletor", "comparação"])
      for (let i = 0; i < opcoes.length; i++) {
        const [id, area, esperado] = opcoes[i];
        if (caminho === "seletor") {
          await enquadrar(p, ".al-opcoes");
          const y = await p.evaluate(() => scrollY);
          await p.locator(".al-opcoes button").nth(i).click();
          await titulo(p, esperado);
          assert.equal(await p.evaluate(() => scrollY), y);
        } else {
          await p
            .getByRole("button", {
              name: "Comparar as quatro opções",
              exact: true,
            })
            .click();
          await p
            .locator(".al-comparacao article")
            .nth(i)
            .getByRole("button", { name: "Ver esta planta", exact: true })
            .click();
          await titulo(p, esperado);
        }
        assert(p.url().includes("/plantas/" + id));
        assert(
          (await p.locator(".al-planta-painel h3").last().innerText()).includes(
            area,
          ),
        );
        await p.waitForFunction(
          (area) =>
            decodeURIComponent(
              document.querySelector(".al-planta-painel a[target=_blank]").href,
            ).includes(area + " m²"),
          area,
        );
        assert.equal(
          await p.locator("[name=nome]").inputValue(),
          "Revisão local",
        );
        assert(await p.locator("#conforto details").evaluate((e) => e.open));
        resultado.r01.push({
          origem,
          via: caminho,
          opcao: id,
          titulo: await p.title(),
          url: new URL(p.url()).pathname,
          formularioPreservado: true,
          expansaoPreservada: true,
        });
      }
    assert.equal(eventos.filter((e) => e.evento === "page_view").length, views);
    await p.reload();
    await titulo(p, opcoes[3][2]);
    await p.goto(base + "/privacidade");
    await p.goBack();
    await titulo(p, opcoes[3][2]);
    assert(
      (
        await p.locator(".al-opcoes button[aria-pressed=true]").innerText()
      ).includes("168"),
    );
  }
  await p.goto("about:blank");
  await p.goto(base + slug);
  await pausa(p, 200);
  const inicioEntrada = eventos.length;
  for (const i of [0, 1, 0]) {
    await p.locator(".al-opcoes button").nth(i).click();
    await enquadrar(p, ".al-planta-quadro");
    await pausa(p, 1200);
  }
  const exposicoes = eventos
    .slice(inicioEntrada)
    .filter((e) => e.evento === "view_floorplan");
  assert.equal(
    exposicoes.filter((e) => e.detalhe.planta === "tipo-02").length,
    1,
  );
  assert.equal(
    exposicoes.filter((e) => e.detalhe.planta === "tipo-01").length,
    1,
  );
  assert.equal(
    eventos.slice(inicioEntrada).filter((e) => e.evento === "page_view").length,
    0,
  );
  resultado.r01Eventos = {
    novaEntrada: false,
    exposicoes: exposicoes.map((e) => e.detalhe.planta),
  };
  // R02: mede crescimento natural, abertura/foco e captura no computador e em ambos os viewports móveis.
  for (const [w, h] of [
    [1440, 1000],
    [390, 844],
    [320, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto("about:blank");
    await p.goto(base + slug);
    await enquadrar(p, ".al-contato-final");
    const fechada = await medidasForm(p);
    assert(fechada.vazio <= 50, JSON.stringify(fechada));
    await foto(p, `${w}-contato-recolhido`);
    await p
      .getByRole("button", { name: "Prefiro receber um contato", exact: true })
      .click();
    assert.equal(
      await p.evaluate(() => document.activeElement.id),
      "interesse-nome",
    );
    const aberta = await medidasForm(p);
    assert(aberta.altura > fechada.altura + 200);
    await enquadrar(p, ".al-form");
    await foto(p, `${w}-formulario-topo`);
    await p
      .getByRole("button", { name: "Registrar meu interesse", exact: true })
      .click();
    assert(
      (await p.locator("[name=nome]").getAttribute("aria-invalid")) === "true",
    );
    await enquadrar(p, ".consentimento");
    await foto(p, `${w}-formulario-final-erros`);
    await semOverflow(p);
    resultado.r02.push({
      viewport: { width: w, height: h },
      recolhida: fechada,
      expandida: aberta,
      crescimentoNatural: true,
      foco: "interesse-nome",
    });
  }
  for (const [w, h] of [
    [390, 844],
    [320, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto("about:blank");
    await p.goto(base + slug);
    await pausa(p, 150);
    const dimensoes = await semOverflow(p);
    assert.equal(dimensoes.innerWidth, w);
    assert.equal(dimensoes.innerHeight, h);
    assert.equal(await p.locator(".al-barra-mobile").count(), 0);
    resultado.barra.push({ width: w, estado: "abertura", visivel: false });
    for (const sec of secoes) {
      await enquadrar(p, "#" + sec);
      await p.locator("#" + sec + " img").evaluateAll((ims) =>
        Promise.all(
          ims.map((im) => {
            if (im.getBoundingClientRect().top < innerHeight) {
              return im.decode().catch(() => {});
            }
          }),
        ),
      );
      await foto(p, `${w}-${sec}`);
      const dim = await semOverflow(p);
      resultado.mobile.push({ secao: sec, ...dim });
    }
    await enquadrar(p, ".al-opcoes");
    assert(await p.locator(".al-barra-mobile").isVisible());
    await foto(p, `${w}-barra-plantas`);
    resultado.barra.push({ width: w, estado: "após abertura", visivel: true });
    await p.locator(".cabecalho__abrir").click();
    await pausa(p);
    assert.equal(await p.locator(".al-barra-mobile").count(), 0);
    await foto(p, `${w}-menu-aberto`);
    resultado.barra.push({ width: w, estado: "menu aberto", visivel: false });
    await p.locator(".cabecalho__abrir").click();
    await p.locator('.al-nav a[href="#plantas"]').click();
    await pausa(p);
    const topo = await p
      .locator("#plantas h2")
      .evaluate((el) => el.getBoundingClientRect().top);
    const barras = await p
      .locator(".al-nav")
      .evaluate((el) => el.getBoundingClientRect().bottom);
    assert(topo >= barras);
    assert.equal(await p.locator(".al-opcoes button").count(), 4);
    await p.locator(".al-opcoes button").nth(3).click();
    await titulo(p, opcoes[3][2]);
    assert(
      decodeURIComponent(
        await p.locator(".al-barra-mobile a").nth(1).getAttribute("href"),
      ).includes("168 m²"),
    );
    resultado.barra.push({
      width: w,
      estado: "após troca para 168",
      contexto: "168 m²",
    });
    await p
      .getByRole("button", { name: "Comparar as quatro opções", exact: true })
      .click();
    await enquadrar(p, "#al-comparacao");
    await foto(p, `${w}-comparacao`);
    await semOverflow(p);
    await p
      .getByRole("button", { name: "Fechar comparação", exact: true })
      .click();
    await p
      .getByRole("button", {
        name: "Prancha 2 — pavimento completo",
        exact: true,
      })
      .click();
    await enquadrar(p, ".al-planta-painel");
    await foto(p, `${w}-duplex-aviso`);
    await p
      .locator(".al-planta-painel")
      .getByRole("button", { name: "Ampliar planta", exact: true })
      .last()
      .click();
    await p.getByRole("dialog").waitFor();
    assert.equal(await p.locator(".al-barra-mobile").count(), 0);
    assert(
      (await p.locator("#al-visor-legenda").innerText()).includes(
        "duas unidades",
      ),
    );
    await p.getByRole("button", { name: "Aproximar +", exact: true }).click();
    assert.equal(await p.locator("dialog output").innerText(), "150%");
    await p.locator("dialog img").evaluate((im) => im.decode());
    await foto(p, `${w}-modal-zoom`);
    for (let n = 0; n < 9; n++) {
      await p.keyboard.press("Tab");
      assert(
        await p.evaluate(() => !!document.activeElement.closest("dialog")),
      );
    }
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("dialog").count(), 0);
    resultado.barra.push({ width: w, estado: "modal aberto", visivel: false });
    await enquadrar(p, "#contato");
    assert.equal(await p.locator(".al-barra-mobile").count(), 0);
    resultado.barra.push({
      width: w,
      estado: "contato visível",
      visivel: false,
    });
    await p
      .getByRole("button", { name: "Prefiro receber um contato", exact: true })
      .click();
    await p.locator("[name=whatsapp]").focus();
    assert.equal(await p.locator(".al-barra-mobile").count(), 0);
    await foto(p, `${w}-campo-focado`);
    resultado.barra.push({
      width: w,
      estado: "campo focado (sem teclado virtual)",
      visivel: false,
    });
    await semOverflow(p);
  }
  // Cópia real usando a área de transferência isolada; não abre destinatários.
  await c.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  await p.goto("about:blank");
  await p.goto(base + slug + "/plantas/tipo-01#plantas");
  await p.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    }),
  );
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  assert.equal(copiado, base + slug + "/plantas/tipo-01#plantas");
  resultado.compartilhamento.copiaReal = copiado;
  for (const modo of ["sucesso", "cancelamento", "falha"]) {
    await p.evaluate(
      (m) =>
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async () => {
            if (m === "cancelamento")
              throw new DOMException("Cancelado", "AbortError");
            if (m === "falha") throw new Error("Falha simulada");
          },
        }),
      modo,
    );
    await p
      .getByRole("button", { name: "Compartilhar planta", exact: true })
      .click();
    const txt = await p.locator(".al-consulta").innerText();
    if (modo === "cancelamento")
      assert(!txt.includes("Não foi possível compartilhar."));
    if (modo === "falha")
      assert.equal(await p.getByLabel("Link da planta").inputValue(), copiado);
    resultado.compartilhamento[modo] = "simulação navigator.share";
  }
  // Revalida os estados existentes sem enviar à integração real.
  await p
    .getByRole("button", { name: "Prefiro receber um contato", exact: true })
    .click();
  assert.equal(await p.locator("[name=interesse]").inputValue(), "");
  assert.equal(await p.locator("[name=consentimento]").isChecked(), false);
  await p.locator("[name=nome]").fill("Revisão local");
  await p.locator("[name=whatsapp]").fill("+351 912 345 678");
  await p.locator("[name=consentimento]").check();
  const leadsAntes = eventos.filter((e) => e.evento === "lead_submit").length;
  for (const conf of [
    { status: 200, json: { ok: true, gravado: false } },
    { status: 500, json: { ok: false } },
    { status: 200, json: { ok: true } },
    { status: 200, json: { ok: false, gravado: true } },
    { status: 200, json: { ok: true, gravado: false }, rede: true },
  ]) {
    resposta = conf.json;
    http = conf.status;
    rede = !!conf.rede;
    await p
      .getByRole("button", { name: "Registrar meu interesse", exact: true })
      .click();
    await p.locator(".form [role=alert]").waitFor();
    assert.equal(await p.locator("[name=nome]").inputValue(), "Revisão local");
    assert.equal(
      eventos.filter((e) => e.evento === "lead_submit").length,
      leadsAntes,
    );
    resultado.formulario.push({
      http,
      ...resposta,
      rede,
      estado: "falha recuperável, dados preservados",
    });
  }
  resposta = { ok: true, gravado: true };
  http = 200;
  rede = false;
  await p
    .getByRole("button", { name: "Registrar meu interesse", exact: true })
    .click();
  await p.locator(".form__ok").waitFor();
  assert.equal(
    eventos.filter((e) => e.evento === "lead_submit").length,
    leadsAntes + 1,
  );
  resultado.formulario.push({
    http,
    ...resposta,
    estado: "sucesso controlado",
  });
  await p.goto(base + "/empreendimentos/flow-aptos");
  await pausa(p);
  assert.equal(await p.locator(".al-contato-final").count(), 0);
  await p.locator(".plantas__aba").nth(2).click();
  assert((await p.locator(".plantas__painel").innerText()).includes("73"));
  const f = p.locator("form").filter({ has: p.locator("#book-nome") });
  await f.locator("[name=nome]").fill("Revisão local");
  await f.locator("[name=whatsapp]").fill("+12125551234");
  await f.locator("[name=consentimento]").check();
  await f.locator("button[type=submit]").click();
  await p.locator(".form__ok").waitFor();
  resultado.flow =
    "Seletor 73 m², layout independente e formulário com confirmação simulada";
  assert.deepEqual(resultado.erros, []);
  resultado.enviosInterceptados = envios;
  resultado.browser = await navegador.version();
  fs.writeFileSync(
    `${pasta}/verificacao-fase4.json`,
    JSON.stringify(resultado, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        r01: resultado.r01.length,
        r02: resultado.r02,
        mobile: resultado.mobile.length,
        barra: resultado.barra.length,
        formulario: resultado.formulario.length,
        compartilhamento: resultado.compartilhamento,
        erros: resultado.erros,
      },
      null,
      2,
    ),
  );
  await navegador.close();
}
main().catch(async (e) => {
  console.error(e);
  if (navegador) await navegador.close();
  fs.writeFileSync(
    `${pasta}/falha-verificacao.json`,
    JSON.stringify({ erro: e.message, parcial: resultado }, null, 2),
  );
  process.exit(1);
});
