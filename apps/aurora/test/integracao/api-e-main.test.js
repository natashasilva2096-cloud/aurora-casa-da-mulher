/**
 * Fachada (google.script.run), roteamento do web app, health check, setup e
 * rotina de manutenção preventiva.
 *   CT-SIS01  fluxo de emergência completo, de ponta a ponta pela API pública
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { dadosUsuaria, inserirPontos, CENTRO } = require('../../../../test/helpers/fixtures');

let ctx;
beforeEach(() => {
  ctx = carregarApp('aurora');
});

describe('formato das respostas da API', () => {
  test('sucesso: { ok: true, dados }', () => {
    expect(ctx.api_infoJuridico()).toEqual({ ok: true, dados: expect.objectContaining({ titulo: expect.any(String) }) });
  });

  test('erro de negócio: { ok: false, codigo, mensagem, detalhes }', () => {
    const r = ctx.api_cadastrar({ nome: 'X' });
    expect(r).toEqual({ ok: false, codigo: 'DADOS_INVALIDOS', mensagem: expect.any(String), detalhes: expect.any(Object) });
  });

  test('erro inesperado: mensagem genérica (sem detalhes técnicos) e log de ERRO', () => {
    jest.spyOn(ctx.ServicoPontos, 'juridico').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });
    const r = ctx.api_infoJuridico();
    expect(r).toEqual({ ok: false, codigo: 'ERRO_INTERNO', mensagem: expect.stringContaining('190'), detalhes: null });
    expect(JSON.stringify(r)).not.toContain('Cannot read');
    expect(ctx.planilha().linhas('Logs').some((l) => l.nivel === 'ERRO')).toBe(true);
  });

  test.each([
    ['api_listarContatos', []],
    ['api_acionarPanico', [CENTRO]],
    ['api_meusAtendimentos', []],
    ['api_equipeListar', []],
    ['api_perfil', []],
  ])('%s exige sessão válida', (fn, args) => {
    expect(ctx[fn]('token-invalido', ...args)).toEqual(expect.objectContaining({ ok: false, codigo: 'SESSAO_INVALIDA' }));
  });

  test('endpoints públicos funcionam sem login (pontos e rastreio)', () => {
    inserirPontos(ctx);
    expect(ctx.api_pontosProximos(CENTRO).ok).toBe(true);
    expect(ctx.api_rastreio('a'.repeat(64)).codigo).toBe('LINK_INVALIDO');
  });
});

describe('CT-SIS01 · fluxo de emergência completo', () => {
  test('cadastro → contatos → pânico → rota para a DEAM mais próxima → rastreio → atualização → encerramento', () => {
    inserirPontos(ctx);
    const d = dadosUsuaria({ nome: 'Luiza Teste' });

    const cad = ctx.api_cadastrar(d);
    expect(cad.ok).toBe(true);
    const token = cad.dados.token;

    expect(ctx.api_salvarContato(token, { nome: 'Mãe', email: 'mae@exemplo.com' }).ok).toBe(true);
    expect(ctx.api_salvarContato(token, { nome: 'Amiga', email: 'amiga@exemplo.com' }).ok).toBe(true);

    const panico = ctx.api_acionarPanico(token, CENTRO);
    expect(panico.ok).toBe(true);
    expect(panico.dados).toEqual(expect.objectContaining({ status: 'ATIVO', situacaoEnvio: 'ENVIADO', enviados: 2 }));
    expect(panico.dados.pontoMaisProximo.tipo).toBe('DEAM');

    const rota = ctx.api_rotaSegura(CENTRO, panico.dados.pontoMaisProximo.id, 'WALKING');
    expect(rota.ok).toBe(true);
    expect(rota.dados.rota.passos.length).toBeGreaterThan(0);

    const tokenRastreio = panico.dados.linkRastreio.split('t=')[1];
    expect(ctx.fakes.mail.enviados.every((m) => m.body.includes(tokenRastreio))).toBe(true);
    expect(ctx.api_rastreio(tokenRastreio).dados).toEqual(expect.objectContaining({ status: 'ATIVO', lat: CENTRO.lat }));

    const nova = { lat: -12.9725, lng: -38.5025, precisao: 5 };
    expect(ctx.api_atualizarLocalizacao(token, panico.dados.acionamentoId, nova).ok).toBe(true);
    expect(ctx.api_rastreio(tokenRastreio).dados.lat).toBe(nova.lat);

    // recarregar a página: o perfil traz o alerta ativo para reabrir a tela
    expect(ctx.api_perfil(token).dados.alertaAtivo.acionamentoId).toBe(panico.dados.acionamentoId);

    expect(ctx.api_encerrarAlerta(token, panico.dados.acionamentoId).dados.status).toBe('ENCERRADO');
    expect(ctx.api_rastreio(tokenRastreio).dados).not.toHaveProperty('lat');
    expect(ctx.api_perfil(token).dados.alertaAtivo).toBeNull();
  });
});

describe('web app (doGet) e verificação de saúde', () => {
  test('?action=health devolve JSON com ok=true quando o ambiente está pronto', () => {
    inserirPontos(ctx);
    const saida = ctx.doGet({ parameter: { action: 'health' } });
    expect(saida.mime).toBe('application/json');
    const r = JSON.parse(saida.getContent());
    expect(r).toEqual(expect.objectContaining({ app: 'aurora', ok: true, ambiente: 'teste', commit: 'local' }));
    expect(r.checks).toEqual(expect.objectContaining({ nucleo: true, planilha: true, abas: true, pontosSeguros: 3 }));
  });

  test('health com commit do build (BuildInfo) para o teste de confirmação do deploy', () => {
    global.BuildInfo = { commit: 'abc1234', data: '2026-11-06' };
    try {
      expect(ctx.saude().commit).toBe('abc1234');
    } finally {
      delete global.BuildInfo;
    }
  });

  test('health falha (ok=false) sem pontos validados, com aba ausente e sem planilha', () => {
    expect(ctx.saude()).toEqual(expect.objectContaining({ ok: false, avisos: ['Nenhum ponto seguro validado'] }));

    ctx.planilha().deleteSheet(ctx.planilha().getSheetByName('Logs'));
    expect(ctx.saude().avisos[0]).toContain('Logs');

    const vazio = carregarApp('aurora', { semSetup: true });
    expect(vazio.saude()).toEqual(expect.objectContaining({ ok: false, checks: expect.objectContaining({ planilha: false }) }));
  });

  test('health avisa cota de e-mail esgotada', () => {
    inserirPontos(ctx);
    ctx.fakes.mail.cota = 0;
    expect(ctx.saude().avisos.join()).toMatch(/Cota/);
  });

  test('roteia a página principal e a página de rastreio (com token saneado)', () => {
    const principal = ctx.doGet({ parameter: {} });
    expect(principal.titulo).toBe('Aurora');
    expect(principal.metas.viewport).toContain('width=device-width');

    const tpl = {};
    jest.spyOn(global.HtmlService, 'createTemplateFromFile').mockImplementation((nome) => {
      tpl.nome = nome;
      return { evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) }) , set token(v) { tpl.token = v; } };
    });
    ctx.doGet({ parameter: { page: 'rastreio', t: 'ABC123<script>' + 'f'.repeat(80) } });
    expect(tpl.nome).toBe('ui/Rastreio');
    expect(tpl.token).toMatch(/^[a-fA-F0-9]{1,64}$/);
  });

  test('include devolve o conteúdo do arquivo HTML', () => {
    expect(ctx.include('ui/Estilos')).toBe('<arquivo ui/Estilos>');
  });

  test('sem doGet event object não quebra', () => {
    expect(ctx.doGet(undefined).titulo).toBe('Aurora');
  });
});

describe('setup do ambiente', () => {
  test('cria planilha, abas, pontos iniciais e o gatilho de manutenção; é idempotente', () => {
    const c = carregarApp('aurora', { semSetup: true });
    c.fakes.props.set('AMBIENTE', 'staging');
    const r = c.setup();
    expect(r.pontosInseridos).toBe(c.DadosIniciais.PONTOS.length);
    expect(r.saude.ok).toBe(true);
    const ss = c.planilha();
    expect(ss.getSheetByName('Sheet1')).toBeNull();
    Object.keys(c.Config.ESQUEMA).forEach((aba) => expect(ss.getSheetByName(aba)).not.toBeNull());
    expect(c.fakes.gatilhos.map((g) => g.handler)).toEqual(['rotinaManutencao']);

    const r2 = c.setup();
    expect(r2.pontosInseridos).toBe(0);
    expect(c.fakes.gatilhos).toHaveLength(1);
    expect(c.fakes.planilhas.size).toBe(1);
  });
});

describe('rotina de manutenção preventiva', () => {
  test('expira alertas antigos e apaga localizações/logs além da retenção (LGPD)', () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T12:00:00Z') });
    try {
      const cad = ctx.api_cadastrar(dadosUsuaria()).dados;
      ctx.api_salvarContato(cad.token, { nome: 'Mae', email: 'mae@exemplo.com' });
      const p = ctx.api_acionarPanico(cad.token, CENTRO).dados;
      ctx.api_encerrarAlerta(cad.token, p.acionamentoId);

      jest.setSystemTime(new Date('2026-11-06T12:00:00Z')); // +36 dias
      const cad2 = ctx.api_cadastrar(dadosUsuaria()).dados;
      ctx.api_acionarPanico(cad2.token, CENTRO);
      jest.setSystemTime(new Date('2026-11-07T01:00:00Z')); // +13 h: o segundo alerta expira

      const r = ctx.rotinaManutencao();
      expect(r.expirados).toBe(1);
      expect(r.localizacoesRemovidas).toBe(1); // só a do alerta antigo
      const antigo = ctx.Repositorio.buscarPorId('Acionamentos', p.acionamentoId);
      expect(antigo.lat).toBeNull();
      expect(ctx.planilha().linhas('Localizacoes')).toHaveLength(1);

      jest.setSystemTime(new Date('2027-03-01T12:00:00Z'));
      expect(ctx.rotinaManutencao().logsRemovidos).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('instalarGatilhos substitui o gatilho anterior', () => {
    ctx.instalarGatilhos();
    ctx.instalarGatilhos();
    expect(ctx.fakes.gatilhos).toHaveLength(1);
    expect(ctx.fakes.gatilhos[0].horas).toBe(1);
  });
});
