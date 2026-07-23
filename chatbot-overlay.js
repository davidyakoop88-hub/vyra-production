(() => {
  function showChatbotReply(detail) {
    const { message, action, payload = {} } = detail || {};
    if (!message) return;
    let host = document.querySelector('#vyraChatbotHost');
    if (!host) { host = document.createElement('div'); host.id = 'vyraChatbotHost'; document.body.append(host); }
    const el = document.createElement('div');
    el.className = 'vyra-chatbot-bubble';
    const icon = document.createElement('i'); icon.className = 'vcb-icon'; icon.textContent = '🤖';
    const body = document.createElement('div'); body.className = 'vcb-body';
    if (payload.username) { const tag = document.createElement('small'); tag.textContent = 'Svar till @' + payload.username; body.append(tag); }
    const span = document.createElement('span'); span.textContent = message; body.append(span);
    el.append(icon, body);
    host.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const ms = Math.max(1, action?.duration || 6) * 1000;
    setTimeout(() => el.classList.remove('show'), ms - 350);
    setTimeout(() => el.remove(), ms);
  }
  document.addEventListener('vyra:chatbot-send', e => showChatbotReply(e.detail || {}));
})();
