/* Apenas localhost. APIs interceptadas; nenhum lead, evento ou mensagem real. */
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  cp = require("node:child_process");
const base = process.env.BASE_URL || "http://localhost:3220";
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const dir = process.env.EVIDENCIAS_DIR || "docs/flow/etapa7b";
fs.mkdirSync(dir, { recursive: true });
const slug = "/empreendimentos/flow-aptos",
  tipos = ["tipo-2", "tipo-3", "tipo-1", "duplex-tipo-2-e-3", "duplex-tipo-1"],
  areas = ["62", "62", "73", "93", "117,7"];
const out = {
  data: new Date().toISOString(),
  modo: "Chromium local: viewports CSS, sem aparelho físico/teclado virtual. Respostas de UI simuladas.",
  rotas: [],
  larguras: [],
  forms: [],
  axe: [],
  eventos: [],
  erros: [],
};
let b;
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
  await p.waitForTimeout(150);
}
async function foto(p, n) {
  await p.locator("img").evaluateAll(
    async (ims) =>
      await Promise.all(
        ims
          .filter((im) => {
            const r = im.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          })
          .map((im) =>
            Promise.race([
              im.decode().catch(() => {}),
              new Promise((r) => setTimeout(r, 2000)),
            ]),
          ),
      ),
  );
  await p.screenshot({ path: `${dir}/${n}.jpg`, quality: 82 });
}
async function axe(p, n) {
  await p.addScriptTag({
    path:
      process.env.AXE_PATH || "/tmp/flow-qa/node_modules/axe-core/axe.min.js",
  });
  const a = await p.evaluate(() =>
    axe.run({
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  out.axe.push({
    estado: n,
    violacoes: a.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    verificacaoManual: a.incomplete.map((v) => ({
      id: v.id,
      n: v.nodes.length,
    })),
  });
  assert.equal(a.violations.length, 0, JSON.stringify(out.axe.at(-1)));
}
(async () => {
  // Comparação factual dos consumidores compartilhados, sem ler banco.
  function carregar(src) {
    const m = { exports: {} };
    vm.runInNewContext(
      ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      { exports: m.exports, module: m, process: { env: {} } },
    );
    return m.exports;
  }
  const antes = carregar(
      cp.execFileSync(
        "git",
        ["show", "origin/main:site/src/content/empreendimentos.ts"],
        { encoding: "utf8" },
      ),
    ),
    depois = carregar(
      fs.readFileSync("src/content/empreendimentos.ts", "utf8"),
    );
  for (const nome of ["alma-seahouses", "soul-residence", "jazz-residence"])
    assert.equal(
      JSON.stringify(antes.getEmpreendimento(nome)),
      JSON.stringify(depois.getEmpreendimento(nome)),
    );
  out.conteudosPreservados = ["Alma", "Soul", "Jazz"];
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const c = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  out.browser = await b.version();
  await c.addInitScript(() => {
    try {
      localStorage.setItem("bossa_consent", "necessarios");
    } catch {}
    window.__cls = 0;
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => {
        if (!e.hadRecentInput) window.__cls += e.value;
      }),
    ).observe({ type: "layout-shift", buffered: true });
  });
  let corpo = { ok: true, gravado: false },
    status = 200,
    rede = false,
    envios = [];
  await c.route("**/api/eventos", async (r) => {
    out.eventos.push(JSON.parse(r.request().postData()));
    await r.fulfill({ json: { ok: true } });
  });
  await c.route("**/api/leads", (r) => {
    envios.push(JSON.parse(r.request().postData()));
    return rede ? r.abort() : r.fulfill({ status, json: corpo });
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => out.erros.push(e.message));
  await p.goto(base + slug + "?utm_source=qa-flow");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(350);
  assert.equal(
    await p.locator("h1").innerText(),
    "Seu apartamento é só o começo.",
  );
  assert.match(
    await p.locator("meta[name=robots]").getAttribute("content"),
    /noindex/,
  );
  assert.equal(
    await p.locator('meta[property="og:image:width"]').getAttribute("content"),
    "2400",
  );
  assert.equal(
    out.eventos.filter((e) => e.evento === "view_floorplan").length,
    0,
  );
  assert(
    !/torre já está fechada|churrasqueira sem fumaça|porcelanato que não solta|praia a três minutos|2 suítes em todos/i.test(
      await p.locator("body").innerText(),
    ),
  );
  await foto(p, "1440-abertura");
  await axe(p, "pagina-desktop");
  await p
    .getByRole("link", { name: "Explorar as plantas", exact: true })
    .click();
  await p.waitForTimeout(1200);
  assert(out.eventos.some((e) => e.evento === "view_floorplan"));
  // Preserva dados do formulário, URL, título e painel nas cinco seleções.
  await p.locator("#visita-nome").fill("Revisão local");
  for (let i = 0; i < 5; i++) {
    await pos(p, ".fl-opcoes");
    const y = await p.evaluate(() => scrollY);
    await p.locator(".fl-opcoes button").nth(i).click();
    assert.equal(await p.evaluate(() => scrollY), y);
    await p.waitForFunction((a) => document.title.includes(a), areas[i]);
    assert(p.url().includes("/plantas/" + tipos[i]));
    assert(
      (await p.locator("link[rel=canonical]").getAttribute("href")).includes(
        tipos[i],
      ),
    );
    assert(
      (
        await p.locator('meta[property="og:title"]').getAttribute("content")
      ).includes(areas[i]),
    );
    assert(
      (await p.locator("#fl-planta-painel").innerText()).includes(areas[i]),
    );
    assert.equal(await p.locator("#visita-nome").inputValue(), "Revisão local");
    const msg = decodeURIComponent(
      await p
        .locator("#fl-planta-painel a[target=_blank]")
        .getAttribute("href"),
    );
    assert(
      msg.includes(areas[i]) && msg.includes(i < 3 ? "2 suítes" : "3 suítes"),
    );
  }
  assert.equal(out.eventos.filter((e) => e.evento === "page_view").length, 1);
  await pos(p, ".fl-opcoes");
  await foto(p, "1440-plantas");
  // Visor: foco, zoom, Tab/Shift+Tab, Escape e retorno.
  await p
    .getByRole("button", { name: "Ampliar planta selecionada", exact: true })
    .click();
  assert(await p.locator("dialog").isVisible());
  assert.equal(await p.locator(":focus").innerText(), "Fechar ×");
  await p.getByRole("button", { name: "Aproximar +", exact: true }).click();
  assert.equal(await p.locator("dialog output").innerText(), "150%");
  for (let n = 0; n < 10; n++) {
    await p.keyboard.press("Tab");
    assert(
      await p.evaluate(() =>
        document.querySelector("dialog").contains(document.activeElement),
      ),
    );
  }
  await axe(p, "visor");
  await foto(p, "1440-visor");
  await p.keyboard.press("Escape");
  assert.equal(
    await p.locator(":focus").getAttribute("aria-label"),
    "Ampliar planta selecionada",
  );
  await p
    .getByRole("button", { name: "Compartilhar planta", exact: true })
    .click();
  assert(
    (await p.evaluate(() => navigator.clipboard.readText())).includes(tipos[4]),
  );
  out.clipboard = "Cópia real local";
  for (let i = 0; i < 5; i++) {
    await p.goto(base + slug + "/plantas/" + tipos[i]);
    await p.waitForTimeout(400);
    const rect = await p
      .locator(".fl-opcoes")
      .evaluate((el) => el.getBoundingClientRect().top);
    assert(rect >= 130 && rect < 400, JSON.stringify({ i, rect }));
    assert.equal(
      await p
        .locator(".fl-opcoes button[aria-pressed=true]")
        .getAttribute("data-planta"),
      tipos[i],
    );
    await p.reload();
    await p.waitForTimeout(300);
    assert((await p.title()).includes(areas[i]));
    out.rotas.push({
      slug: tipos[i],
      area: areas[i],
      top: rect,
      recarregada: true,
    });
  }
  // Voltar do histórico preserva identificação.
  await p.goto(base + slug);
  await p.locator(".fl-opcoes button").nth(2).click();
  await p.goto(base + "/empreendimentos");
  await p.goBack();
  await p.waitForTimeout(300);
  assert((await p.title()).includes("73"));
  for (const width of [1440, 360, 390, 768, 1024]) {
    await p.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await p.goto(base + slug);
    await p.waitForTimeout(300);
    for (const id of [
      "inicio-flow",
      "plantas",
      "lazer",
      "flow-move",
      "the-roof",
      "vistas",
      "duplex",
      "engenharia",
      "construcao",
      "localizacao-flow",
      "visita",
      "duvidas-flow",
    ]) {
      await pos(p, "#" + id);
      const m = await p.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(m.scrollWidth <= m.width, JSON.stringify({ id, ...m }));
      out.larguras.push({ secao: id, ...m });
      if (
        [1440, 360, 390, 768, 1024].includes(width) &&
        [
          "inicio-flow",
          "plantas",
          "duplex",
          "visita",
          "flow-move",
          "the-roof",
          "vistas",
          "construcao",
          "localizacao-flow",
        ].includes(id)
      ) {
        if (id === "inicio-flow") await p.evaluate(() => scrollTo(0, 0));
        await foto(p, `${width}-${id}`);
      }
    }
  }
  // Três direções x doze alturas: fonte real, sem crop e WhatsApp contextual.
  for (let d = 0; d < 3; d++) {
    await p.locator(".fl-abas button").nth(d).click();
    for (let n = 0; n < 12; n++) {
      await p.locator(".fl-andares button").nth(n).click();
      const txt = await p
          .locator(".fl-vista__andar")
          .evaluate((el) => el.firstChild.textContent.trim()),
        href = decodeURIComponent(
          await p.locator(".fl-vista-rodape a").getAttribute("href"),
        );
      assert(href.includes("referência de drone"));
      await p.waitForFunction(
        (andar) =>
          decodeURIComponent(
            document.querySelector(".fl-vista-rodape a").href,
          ).includes(andar),
        txt,
      );
      assert.equal(
        await p
          .locator(".fl-vista__tela img")
          .evaluate((im) => getComputedStyle(im).objectFit),
        "contain",
      );
    }
  }
  out.vistas = 36;
  for (const nome of [
    "Planta ilustrativa do 5º pavimento",
    "Planta ilustrativa do 24º pavimento",
  ]) {
    await p
      .locator(
        nome.includes("5º")
          ? "#flow-move details summary"
          : "#the-roof details summary",
      )
      .click();
    await p
      .getByRole("button", { name: "Ampliar: " + nome, exact: true })
      .click();
    assert((await p.locator("dialog h2").innerText()).includes(nome));
    await p.keyboard.press("Escape");
  }
  // Campos sem data e quatro falhas + sucesso, sem gravação real.
  await p.setViewportSize({ width: 390, height: 844 });
  await pos(p, "#visita");
  assert.equal(await p.locator("#visita input[type=date]").count(), 0);
  await p.locator("#visita-nome").fill("Revisão segura");
  await p.locator("#visita-whats").fill("+351 912 345 678");
  assert.equal(await p.locator("#visita-ok").isChecked(), false);
  await p.locator("#visita-ok").check();
  for (const caso of [
    { status: 200, body: { ok: true, gravado: false } },
    { status: 200, body: { ok: true } },
    { status: 200, body: { ok: false, gravado: true } },
    { status: 500, body: { ok: true, gravado: true } },
    { status: 200, body: { ok: true, gravado: true }, rede: true },
  ]) {
    status = caso.status;
    corpo = caso.body;
    rede = !!caso.rede;
    const leads = out.eventos.filter((e) => e.evento === "lead_submit").length;
    await p
      .getByRole("button", { name: "Enviar pedido de visita", exact: true })
      .click();
    await p.waitForTimeout(150);
    assert.equal(
      await p.locator("#visita-nome").inputValue(),
      "Revisão segura",
    );
    assert.equal(
      out.eventos.filter((e) => e.evento === "lead_submit").length,
      leads,
    );
    out.forms.push({ ...caso, resultado: "falha, dados preservados" });
  }
  rede = false;
  status = 200;
  corpo = { ok: true, gravado: true };
  await p
    .getByRole("button", { name: "Enviar pedido de visita", exact: true })
    .click();
  await p.waitForTimeout(150);
  assert(
    await p
      .getByText(
        "Recebemos seu pedido. Nossa equipe entrará em contato para combinar a visita.",
        { exact: false },
      )
      .isVisible(),
  );
  await p
    .getByRole("button", {
      name: "Prefiro solicitar a apresentação do Flow",
      exact: true,
    })
    .click();
  await p.locator("#book-nome").fill("Revisão segura");
  await p.locator("#book-whats").fill("+49 30 123456");
  await p.locator("#book-ok").check();
  await p.locator("form:visible button[type=submit]").click();
  await p.waitForTimeout(150);
  assert(
    await p
      .getByText(
        "Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar a apresentação do Flow.",
        { exact: true },
      )
      .isVisible(),
  );
  assert.equal(
    out.eventos.filter((e) => e.evento === "request_material").length,
    1,
  );
  assert.equal(
    out.eventos.filter(
      (e) =>
        e.evento === "download_material" ||
        e.evento === "request_visit" ||
        e.evento === "view_price",
    ).length,
    0,
  );
  out.forms.push({
    sucessos: 2,
    requestMaterial: 1,
    agendamentoConfirmado: false,
    downloads: 0,
  });
  out.enviosInterceptados = envios.length;
  assert(envios.every((x) => x.empreendimento === "flow-aptos" && !x.data));
  await axe(p, "sucessos-formulario");
  await foto(p, "390-contato-sucesso-simulado");
  // Regressão de navegação e formulário do Alma; entregues continuam acessíveis.
  await p.goto(base + "/empreendimentos/alma-seahouses");
  await p
    .getByRole("button", { name: "Prefiro receber um contato", exact: true })
    .click();
  await p.locator("[name=nome]").fill("Regressão local");
  await p.locator(".al-opcoes button").nth(1).click();
  assert((await p.title()).includes("114"));
  assert.equal(await p.locator("[name=nome]").inputValue(), "Regressão local");
  out.alma = "Título, seleção e preservação do formulário verificados";
  for (const nome of ["soul-residence", "jazz-residence"]) {
    const r = await p.request.get(base + "/empreendimentos/" + nome);
    assert.equal(r.status(), 200);
  }
  assert.equal(out.erros.length, 0);
  console.log(
    JSON.stringify({
      rotas: out.rotas.length,
      larguras: out.larguras.length,
      vistas: out.vistas,
      forms: out.forms.length,
      axe: out.axe.length,
      erros: out.erros,
    }),
  );
})()
  .catch((e) => {
    out.falha = String(e);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(`${dir}/verificacao.json`, JSON.stringify(out, null, 2));
    await b?.close();
  });
