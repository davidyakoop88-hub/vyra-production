(() => {
  let mounted = false;

  function showGate(detail, billing) {
    document.querySelector('.entitlement-gate')?.remove();
    const gate = document.createElement('div');
    gate.className = 'entitlement-gate';
    const verified = detail.user?.emailVerified !== false;
    gate.innerHTML = `<section>
      <div class="auth-brand"><i>V</i><b>VYRA</b></div>
      <small>KONTO KLART</small>
      <h1>${verified ? 'Aktivera VYRA Premium' : 'Verifiera din e-post'}</h1>
      <p>${verified
        ? 'Börja med 3 dagar gratis. Därefter kostar Premium 15 USD per månad och kan sägas upp när som helst.'
        : 'Vi behöver bekräfta din e-post innan en provperiod eller betalning kan startas.'}</p>
      <strong>${detail.user?.displayName || detail.user?.email || 'Ditt VYRA-konto'}</strong>
      <button class="primary entitlement-start">${verified ? 'Starta 3 dagar gratis' : 'Skicka verifieringsmejl'}</button>
      <button class="entitlement-logout">Logga ut</button>
      <p class="entitlement-state">${billing?.subscription?.status === 'past_due' ? 'Betalningen behöver uppdateras.' : ''}</p>
    </section>`;
    document.body.append(gate);

    gate.querySelector('.entitlement-logout').onclick = () => window.VyraAuth.logout();
    gate.querySelector('.entitlement-start').onclick = async event => {
      const button = event.currentTarget;
      const state = gate.querySelector('.entitlement-state');
      button.disabled = true;
      try {
        if (!verified) {
          await window.VyraAuth.api('/api/auth/email/send-verification', { method: 'POST', body: '{}' });
          state.textContent = 'Verifieringsmejlet är skickat. Öppna länken i mejlet och logga sedan in igen.';
          button.textContent = 'Mejlet är skickat';
          return;
        }
        state.textContent = 'Öppnar säker betalning…';
        const workspace = detail.workspaces[0];
        const result = await window.VyraAuth.api(`/api/workspaces/${workspace.id}/billing/checkout`, { method: 'POST', body: '{}' });
        location.href = result.url;
      } catch (error) {
        state.textContent = error.message;
        button.disabled = false;
      }
    };
  }

  async function check(detail) {
    if (mounted || !detail?.workspaces?.length) return;
    mounted = true;
    if (detail.user?.isPlatformAdmin) return;
    try {
      const workspace = detail.workspaces[0];
      const billing = await window.VyraAuth.api(`/api/workspaces/${workspace.id}/billing`);
      const active = billing.plan === 'premium' && ['active', 'trialing', 'past_due'].includes(billing.subscription?.status);
      if (!active) showGate(detail, billing);
    } catch (error) {
      mounted = false;
      window.toast?.(error.message);
    }
  }

  addEventListener('vyra-auth-ready', event => check(event.detail));
  setTimeout(() => check(window.VyraAuth?.lastDetail?.()), 500);
})();
