/* Rota HTTP real do site com RPC fictícia local. Nenhum banco/CRM real. */
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  { spawn } = require("node:child_process");
(async () => {
  let chamadas = [],
    falhar = false;
  const rpc = http.createServer(async (req, res) => {
    let txt = "";
    for await (const b of req) txt += b;
    assert(
      [
        "/rest/v1/rpc/site_registrar_lead",
        "/rest/v1/rpc/site_registrar_evento",
      ].includes(req.url),
    );
    chamadas.push({ rota: req.url, body: JSON.parse(txt) });
    res.writeHead(falhar ? 500 : 200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        falhar
          ? { message: "Falha fictícia", code: "XX000" }
          : "00000000-0000-4000-8000-000000000001",
      ),
    );
  });
  await new Promise((r) => rpc.listen(0, "127.0.0.1", r));
  const next = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3210"],
    {
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${rpc.address().port}`,
        SUPABASE_SECRET_KEY: "chave-ficticia-local",
        SUPABASE_SERVICE_ROLE_KEY: "",
        BOSSA_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000002",
      },
      stdio: "ignore",
    },
  );
  try {
    let pronto = false;
    for (let n = 0; n < 80; n++) {
      try {
        await fetch("http://localhost:3210/api/leads");
        pronto = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert(pronto);
    const enviar = (body) =>
      fetch("http://localhost:3210/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: "Teste isolado",
          formulario: "visita",
          empreendimento: "flow-aptos",
          whatsapp: "+351912345678",
          consentimento: true,
          site: "",
          utm: { utm_source: "qa-controlado" },
          ...body,
        }),
      });
    for (const [tel, esperado] of [
      ["+351912345678", "351912345678"],
      ["+4930123456", "4930123456"],
      ["+12125551234", "12125551234"],
      ["47992889395", "5547992889395"],
    ]) {
      let r = await enviar({ whatsapp: tel });
      assert.equal(r.status, 200);
      let j = await r.json();
      assert(j.ok === true && j.gravado === true);
      let b = chamadas.at(-1).body;
      assert.equal(b.p_telefone, esperado);
      assert.equal(b.p_empreendimento, "flow-aptos");
      assert.deepEqual(b.p_utm, { utm_source: "qa-controlado" });
    }
    await enviar({ formulario: "book" });
    assert.equal(chamadas.at(-1).body.p_formulario, "book");
    await enviar({ data: "2026-12-01" });
    assert.equal(chamadas.at(-1).body.p_data, undefined);
    assert.equal((await enviar({ consentimento: false })).status, 422);
    falhar = true;
    let r = await enviar({});
    assert.equal(r.status, 500);
    assert.notEqual((await r.json()).gravado, true);
    falhar = false;
    let ev = await fetch("http://localhost:3210/api/eventos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evento: "request_material",
        visitante: "QA2345",
        detalhe: { empreendimento: "flow-aptos", arquivo: "apresentacao-flow" },
        pagina: "/empreendimentos/flow-aptos",
      }),
    });
    assert.equal(ev.status, 204);
    assert.equal(chamadas.at(-1).body.p_evento, "request_material");
    const out = {
      data: new Date().toISOString(),
      modo: "API real contra RPC HTTP fictícia local; sem Supabase/CRM real",
      aprovados: [
        "Visita e book mantêm contrato RPC existente",
        "Telefones +351, +49, +1 e nacional preservados até RPC",
        "UTMs verdadeiras preservadas",
        "Data não faz parte do contrato, UI não solicita data",
        "Sucesso somente com gravação confirmada; validação 422 e RPC 500",
        "request_material permitido pela API e transportado até RPC local",
      ],
      requisicoesRPC: chamadas.length,
    };
    fs.mkdirSync("docs/flow/etapa7b", { recursive: true });
    fs.writeFileSync(
      "docs/flow/etapa7b/api-controlada.json",
      JSON.stringify(out, null, 2),
    );
    console.log(out);
  } finally {
    next.kill("SIGTERM");
    rpc.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
