(function (root) {
  'use strict';

  function nameOf(user) {
    return user?.displayName || user?.display_name || user?.email || 'VYRA-konto';
  }

  async function update(detail) {
    const user = detail?.user;
    const workspace = detail?.workspaces?.[0];
    if (!user) return;

    const name = nameOf(user);
    const nameElement = document.querySelector('#userName');
    const planElement = document.querySelector('#accountPlan');
    if (nameElement) nameElement.textContent = name;

    if (typeof state === 'object' && state) {
      state.user = name;
      if (typeof save === 'function') save();
      if (typeof view !== 'undefined' && view === 'home' && typeof render === 'function') render();
    }

    if (!planElement) return;
    if (user.isPlatformAdmin) {
      planElement.textContent = 'Administratör · full åtkomst';
      return;
    }
    if (!workspace) {
      planElement.textContent = 'Konto aktivt';
      return;
    }

    try {
      const billing = await root.VyraAuth.api(`/api/workspaces/${workspace.id}/billing`);
      planElement.textContent = billing.plan === 'premium'
        ? billing.subscription?.status === 'trialing'
          ? 'Premium · provperiod'
          : 'Premium · aktiv'
        : 'Premium krävs';
    } catch {
      planElement.textContent = 'Konto aktivt';
    }
  }

  root.addEventListener('vyra-auth-ready', event => update(event.detail));
  setTimeout(() => update(root.VyraAuth?.lastDetail?.()), 500);
})(window);
