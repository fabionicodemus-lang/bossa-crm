/* Chromium local: APIs interceptadas, nenhuma mensagem/lead real. Não é aparelho físico. */
const {
  chromium,
} = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto");
const root = "docs/flow/etapa7b",
  url = "http://localhost:3220/empreendimentos/flow-aptos";
let b;
const out = {
  metodo:
    "Chromium local; viewport CSS efetivo; reduz movimento. API interceptada. Sem aparelho físico, teclado virtual ou escuta integral.",
  cookies: [],
  move: [],
  vistas: [],
  plantas: [],
  regressoes: [],
  erros: [],
};
async function pos(p, s) {
  await p
    .locator(s)
    .first()
    .evaluate((e) =>
      scrollTo({
        top: scrollY + e.getBoundingClientRect().top - 155,
        behavior: "instant",
      }),
    );
  await p.waitForTimeout(100);
}
async function shot(p, n) {
  await p.locator("img").evaluateAll(async (ims) =>
    Promise.all(
      ims
        .filter((im) => {
          const r = im.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0;
        })
        .map((im) =>
          Promise.race([
            im.decode().catch(() => {}),
            new Promise((r) => setTimeout(r, 1500)),
          ]),
        ),
    ),
  );
  await p.screenshot({ path: `${root}/${n}.jpg`, quality: 85 });
}
async function overflow(p) {
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
}
(async () => {
  const file = fs.readFileSync("public/img/flow/plantas/tipo1-73m2.webp");
  assert.equal(file.length, 289054);
  out.sha256 = crypto.createHash("sha256").update(file).digest("hex");
  assert.equal(
    out.sha256,
    "f41defb65a1a7f5bad65b9ee2975607f544d03ebb02eea6e0f44778885b62a68",
  );
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  out.browser = await b.version();
  for (const [width, height] of [
    [360, 640],
    [390, 844],
    [768, 844],
    [1024, 844],
    [1440, 900],
  ]) {
    const c = await b.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    await c.route("**/api/**", (r) =>
      r.fulfill({ json: { ok: true, gravado: false } }),
    );
    const p = await c.newPage();
    p.on("pageerror", (e) => out.erros.push(e.message));
    await p.goto(url);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForSelector("#fl-consentimento .cookies");
    await overflow(p);
    await shot(p, `${width}x${height}-cookies-primeiro-acesso`);
    const cp = await p
      .locator(".cookies")
      .evaluate((e) => getComputedStyle(e).position);
    assert.equal(cp, width <= 860 ? "static" : "fixed");
    await p
      .getByRole("link", { name: "Explorar as plantas", exact: true })
      .scrollIntoViewIfNeeded();
    const prova = await p.evaluate(() => {
      const c = document.querySelector(".cookies").getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        acoes: [...document.querySelectorAll(".fl-abertura-acoes a")].map(
          (a) => {
            const r = a.getBoundingClientRect(),
              mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            return {
              texto: a.textContent.trim(),
              sobreposto:
                c.top < r.bottom &&
                c.bottom > r.top &&
                c.left < r.right &&
                c.right > r.left,
              alcancavel: a.contains(document.elementFromPoint(mid.x, mid.y)),
            };
          },
        ),
      };
    });
    out.cookies.push({ ...prova, posicao: cp });
    assert(
      prova.acoes.every((a) => !a.sobreposto && a.alcancavel),
      JSON.stringify(prova),
    );
    await shot(p, `${width}x${height}-cookies-cta-apos-rolagem`);
    await p
      .getByRole("button", { name: "Só os necessários", exact: true })
      .click();
    assert.equal(await p.locator(".cookies").count(), 0);
    assert.equal(
      await p.evaluate(() => localStorage.getItem("bossa_consent")),
      "necessarios",
    );
    const ordem = await p.evaluate(() =>
      ["plantas", "lazer", "duplex"].map(
        (id) => document.getElementById(id).getBoundingClientRect().top,
      ),
    );
    assert(ordem[0] < ordem[1] && ordem[1] < ordem[2]);
    await pos(p, ".fl-opcoes");
    for (let i = 0; i < 5; i++) {
      await p.locator(".fl-opcoes button").nth(i).click();
      if (width === 768) {
        const h = await p
          .locator(".fl-planta-quadro")
          .evaluate((e) => e.getBoundingClientRect().height);
        assert(h <= 460);
        out.plantas.push({ width, indice: i, altura: h });
      }
    }
    await p.locator(".fl-opcoes button").nth(2).click();
    assert.match(
      await p.locator(".fl-planta-quadro img").getAttribute("src"),
      /tipo1-73m2.webp/,
    );
    await pos(p, ".fl-planta-quadro");
    await shot(p, `${width}-tipo1-aprovado`);
    await p
      .getByRole("button", { name: "Ampliar planta selecionada", exact: true })
      .click();
    assert.match(
      await p.locator("dialog img").getAttribute("src"),
      /tipo1-73m2.webp/,
    );
    const fechar = await p
      .getByRole("button", { name: "Fechar ×", exact: true })
      .evaluate((e) => ({
        nowrap: getComputedStyle(e).whiteSpace,
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
      }));
    assert.equal(fechar.nowrap, "nowrap");
    assert(fechar.height >= 44);
    await p.getByRole("button", { name: "Aproximar +", exact: true }).click();
    assert.equal(await p.locator("dialog output").innerText(), "150%");
    await shot(p, `${width}-visor-tipo1`);
    await p.keyboard.press("Escape");
    for (const i of [0, 1]) {
      await p.locator(".fl-opcoes button").nth(i).click();
      assert.match(
        await p.locator("#fl-planta-painel").innerText(),
        /provisória.*Conjuntos técnicos em revisão/s,
      );
      await p
        .getByRole("button", {
          name: "Ampliar planta selecionada",
          exact: true,
        })
        .click();
      assert.match(
        await p.locator("#fl-visor-legenda").innerText(),
        /não representa desenho executivo validado/,
      );
      await p.keyboard.press("Escape");
    }
    if (width <= 860) {
      await pos(p, ".fl-move-seletor");
      for (let i = 0; i < 5; i++) {
        const y = await p.evaluate(() => scrollY);
        await p.locator(".fl-move-seletor select").selectOption(String(i));
        assert.equal(await p.evaluate(() => scrollY), y);
        const r = await p.locator("#fl-move-foto .fl-imagem").boundingBox();
        assert(r.y >= 135);
        assert(r.y < height);
        if (width <= 390) assert(r.y + r.height < height - 72);
        out.move.push({
          width,
          indice: i,
          imagem: { top: r.y, height: r.height },
          scrollPreservado: true,
        });
      }
      await shot(p, `${width}-move-escolhido`);
    } else {
      await p.locator(".fl-move-escolhas button").nth(1).click();
      await pos(p, ".fl-move-editorial");
      await shot(p, `${width}-move-escolhido`);
    }
    await pos(p, ".fl-vista");
    if (width <= 860) {
      const a = await p.locator(".fl-vista__tela").boundingBox(),
        s = await p.locator(".fl-vista-seletor").boundingBox();
      assert(s.y + s.height - a.y - a.height < 170);
      const y = await p.evaluate(() => scrollY);
      await p.locator(".fl-vista-seletor select").selectOption("13");
      await p.locator(".fl-abas button").nth(2).click();
      assert.equal(
        await p.locator(".fl-vista-seletor select").inputValue(),
        "13",
      );
      assert.equal(await p.evaluate(() => scrollY), y);
    }
    await shot(p, `${width}-vistas-compactas`);
    await overflow(p);
    await c.close();
  }
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
  await p.goto(url);
  await pos(p, ".fl-vista");
  const listas = [
      [7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 24],
      [7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 24],
      [24, 23, 21, 19, 18, 16, 15, 13, 11, 10, 8, 7],
    ],
    ids = ["a", "c", "b"];
  for (let d = 0; d < 3; d++) {
    await p.locator(".fl-abas button").nth(d).click();
    for (const n of listas[d]) {
      await p.locator(".fl-vista-seletor select").selectOption(String(n));
      const src = decodeURIComponent(
        await p.locator(".fl-vista__tela img").getAttribute("src"),
      );
      assert(
        src.includes(
          `/vista/${ids[d]}-${String(listas[d].indexOf(n)).padStart(2, "0")}.jpg`,
        ),
      );
      await p.waitForFunction(
        (n) =>
          decodeURIComponent(
            document.querySelector(".fl-vista-rodape a").href,
          ).includes(n + "º"),
        n,
      );
      out.vistas.push({ direcao: ids[d], altura: n, src });
    }
  }
  await p.locator(".fl-abas button").nth(0).click();
  await p.locator(".fl-vista-seletor select").selectOption("20");
  await p.locator(".fl-abas button").nth(2).click();
  assert.equal(await p.locator(".fl-vista-seletor select").inputValue(), "19");
  assert.match(
    await p.locator(".fl-vista-aviso").innerText(),
    /Não há foto do 20º.*Exibindo o 19º/,
  );
  out.andarAusente = await p.locator(".fl-vista-aviso").innerText();
  await p
    .getByRole("button", { name: "Comparar duas alturas", exact: true })
    .click();
  await p.locator("#fl-comparar-alturas select").selectOption("7");
  await pos(p, "#fl-comparar-alturas");
  await shot(p, "390-comparacao-real");
  assert.equal(await p.locator(".fl-comparar-foto img").count(), 2);
  assert(!/a validar/i.test(await p.locator("#engenharia").innerText()));
  // Contexto sem consentimento pré-definido: banner normal dos demais consumidores.
  const reg = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await reg.route("**/api/**", (r) =>
    r.fulfill({ json: { ok: true, gravado: false } }),
  );
  const pr = await reg.newPage();
  await pr.goto(url);
  await pr.waitForSelector("#fl-consentimento .cookies");
  await pr.locator('.cabecalho a[href="/empreendimentos"]').first().click();
  await pr.waitForURL("**/empreendimentos");
  await pr.waitForSelector(".cookies");
  assert.equal(
    await pr.locator(".cookies").evaluate((e) => getComputedStyle(e).position),
    "fixed",
  );
  out.navegacaoSPA = "Portal do Flow removido; banner institucional preservado";
  for (const slug of ["alma-seahouses", "soul-residence", "jazz-residence"]) {
    await pr.goto("http://localhost:3220/empreendimentos/" + slug);
    await pr.waitForSelector(".cookies");
    assert.equal(
      await pr
        .locator(".cookies")
        .evaluate((e) => getComputedStyle(e).position),
      "fixed",
    );
    assert.equal(await pr.locator("#fl-consentimento").count(), 0);
    out.regressoes.push({ slug, cookies: "fixed" });
  }
  await reg.close();
  assert.equal(out.erros.length, 0);
  console.log(
    JSON.stringify({
      cookies: out.cookies.length,
      move: out.move.length,
      vistas: out.vistas.length,
      plantasTablet: out.plantas,
      regressoes: out.regressoes,
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
    fs.writeFileSync(`${root}/interface.json`, JSON.stringify(out, null, 2));
    await b?.close();
  });
