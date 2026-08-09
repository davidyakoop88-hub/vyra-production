(function () {
  'use strict';
  // Losenordsstyrka i registreringsrutan (Etapp 6C).
  //
  // Kravet ar minlength 12 (server/security.js validatePassword: 12-128). Fore den har modulen fick
  // man veta det forst nar man tryckte — webblasarens egen validering sager "matcha det begarda
  // formatet" och namner inte hur manga tecken som saknas.
  //
  // BARA I REGISTRERINGSLAGET. Dar VALJER man ett losenord. I inloggningslaget skriver man ett man
  // redan har, och en matare som doms ut ett fungerande losenord ar bara oro. Prov 14 vaktar det.
  //
  // Rutan byggs om av auth-client.js shell() vid varje lagesbyte, sa mataren monteras via
  // MutationObserver pa body — samma skal som vyra-historik.js observerar #view: den som ager
  // markupen anropar ingen render-kedja vi kan haka i.

  const KRAV = 12;

  // Tre nivaer. Gult ar inte "nastan godkant" utan "godkant men tunt": ett losenord pa 12 tecken
  // som bara ar en teckensort ar svagare an ett pa 12 blandade, och det ska synas.
  function bedom(v) {
    const p = String(v || '');
    if (!p) return null;
    if (p.length < KRAV) {
      const kvar = KRAV - p.length;
      return { niva: 'svag', andel: Math.max(0.08, p.length / KRAV),
        text: `${kvar} tecken till (minst ${KRAV})` };
    }
    const sorter = [/[a-zåäö]/, /[A-ZÅÄÖ]/, /\d/, /[^\w\såäöÅÄÖ]/].filter(re => re.test(p)).length;
    if (sorter < 2) {
      return { niva: 'ok', andel: 0.7,
        text: 'Godkänt — blanda gärna in siffror eller versaler' };
    }
    return { niva: 'stark', andel: 1, text: '✓ Bra lösenord' };
  }

  function montera() {
    const gate = document.querySelector('.auth-gate');
    if (!gate) return;
    const falt = gate.querySelector('#authPassword');
    const registrering = !!gate.querySelector('#authName');
    const befintlig = gate.querySelector('[data-losenordsstyrka]');

    if (!falt || !registrering) { if (befintlig) befintlig.remove(); return }
    if (befintlig) return;

    const box = document.createElement('div');
    box.className = 'losenordsstyrka';
    box.setAttribute('data-losenordsstyrka', 'tom');
    box.innerHTML = '<b><i></i></b><span></span>';
    falt.closest('label').insertAdjacentElement('afterend', box);

    const rita = () => {
      const d = bedom(falt.value);
      box.dataset.losenordsstyrka = d ? d.niva : 'tom';
      box.querySelector('i').style.width = d ? Math.round(d.andel * 100) + '%' : '0%';
      const span = box.querySelector('span');
      const text = d ? d.text : '';
      if (span.textContent !== text) span.textContent = text;
    };
    falt.addEventListener('input', rita);
    rita();
  }

  new MutationObserver(montera).observe(document.body, { childList: true, subtree: true });
  montera();

  window.VyraLosenordsstyrka = { bedom, KRAV };
})();
