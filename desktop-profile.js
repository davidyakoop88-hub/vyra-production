(() => {
  const params = new URLSearchParams(location.search);
  const encoded = params.get('profile');
  if (!params.has('desktop') || !encoded) return;

  try {
    const bytes = Uint8Array.from(atob(decodeURIComponent(encoded)), char => char.charCodeAt(0));
    const profile = JSON.parse(new TextDecoder().decode(bytes));
    const state = JSON.parse(localStorage.getItem('vyra-state') || '{}');
    state.user = profile.user?.displayName || profile.user?.email || 'VYRA-konto';
    window.VyraSessionState.writeActive('vyra-state', JSON.stringify(state));

    addEventListener('DOMContentLoaded', () => {
      const plan = document.querySelector('#accountPlan');
      if (plan) {
        plan.textContent = profile.plan === 'admin'
          ? 'Administratör · full åtkomst'
          : profile.status === 'trialing'
            ? 'Premium · provperiod'
            : 'Premium · aktiv';
      }
    }, { once: true });
  } catch {
    location.replace('https://vyralive.app/studio.html?desktop-auth=1');
  }
})();
