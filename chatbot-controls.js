(() => {
  const enhance = () => {
    document.querySelectorAll('.command').forEach((row, index) => {
      if (row.querySelector('[data-test-chatbot]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testChatbot = String(index);
      button.textContent = 'Testa';
      row.append(button);
    });
  };

  document.addEventListener('click', event => {
    if (event.target.closest('#addCommand')) {
      event.preventDefault();
      const input = document.querySelector('#newCmd');
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const test = event.target.closest('[data-test-chatbot]');
    if (test) {
      const extras = JSON.parse(localStorage.getItem('vyra-extras') || '{"commands":[]}');
      const command = extras.commands?.[Number(test.dataset.testChatbot)];
      const state = window.VyraActionEvent?.read?.();
      const action = state?.actions?.find(item => item.id === command?.actionId);
      if (!command || !action) return window.toast?.('Chatbotregeln saknas');
      window.VyraActionEvent.runAction(action, { username:'TestUser', comment:command.cmd, command:command.cmd, value:command.cmd, __test:true });
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target?.id !== 'newCmd') return;
    const input = event.target;
    if (input.value && !input.value.startsWith('!')) input.value = '!' + input.value.replace(/^!+/, '');
  });
  new MutationObserver(enhance).observe(document.documentElement, { childList:true, subtree:true });
  enhance();
})();
