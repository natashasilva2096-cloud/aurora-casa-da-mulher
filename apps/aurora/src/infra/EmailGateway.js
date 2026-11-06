/**
 * Gateway de mensageria (CT-INT02). No protótipo o canal é e-mail via MailApp.
 * Trocar por SMS/WhatsApp no futuro = reimplementar apenas este arquivo (RNF07).
 */
var EmailGateway = (function () {
  /** @return {{ok:boolean, erro?:string, tentativas:number}} */
  function enviar(mensagem, tentativasMax) {
    var max = tentativasMax || 1;
    var ultimoErro = '';
    for (var t = 1; t <= max; t++) {
      try {
        if (MailApp.getRemainingDailyQuota() < 1) {
          return { ok: false, erro: 'COTA_EMAIL_ESGOTADA', tentativas: t };
        }
        MailApp.sendEmail({
          to: mensagem.para,
          subject: mensagem.assunto,
          body: mensagem.texto,
          htmlBody: mensagem.html,
          name: 'Aurora',
        });
        return { ok: true, tentativas: t };
      } catch (e) {
        ultimoErro = String(e && e.message ? e.message : e).substring(0, 200);
      }
    }
    return { ok: false, erro: ultimoErro || 'FALHA_ENVIO', tentativas: max };
  }

  function cotaRestante() {
    try {
      return MailApp.getRemainingDailyQuota();
    } catch (e) {
      return -1;
    }
  }

  return { enviar: enviar, cotaRestante: cotaRestante };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { EmailGateway: EmailGateway };
