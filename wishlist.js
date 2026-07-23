// Önskemål — där användaren kan skriva vad de vill se förbättrat eller nytt i VYRA.
// "Skicka" sparar önskemålet lokalt (så det syns i listan här) och öppnar användarens
// e-postklient med texten förifylld, adresserad till VYRA-teamet.
const WISHLIST_KEY = 'vyra-wishlist';
// TODO: byt till den riktiga support-/önskemål-adressen när den finns.
const WISHLIST_EMAIL = 'TODO@exempel.se';
const wishlistItems = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
function saveWishlistItems() { localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlistItems)); }

function wishlistHtml() {
  const list = wishlistItems.length
    ? wishlistItems.map((w, i) => `<div class="command"><i>✎</i><span><b>${w.text.slice(0, 60)}${w.text.length > 60 ? '…' : ''}</b><small>${new Date(w.date).toLocaleDateString('sv-SE')}</small></span><button data-wish="${i}">Ta bort</button></div>`).join('')
    : '<p style="color:#777c89;font-size:9px">Inga önskemål skickade ännu.</p>';
  return extraHeader('Önskemål', 'Skriv vad du vill se förbättrat eller nytt i VYRA — vi bygger det åt dig.')
    + `<article class="card table-card">
        <textarea id="wishText" placeholder="Beskriv vad du önskar..." rows="4" style="width:100%;box-sizing:border-box;background:#151821;border:1px solid #292d38;color:#fff;border-radius:6px;padding:10px;font:inherit;resize:vertical"></textarea>
        <button class="primary" id="sendWish" type="button" style="margin-top:10px">✉ Skicka önskemål</button>
      </article>
      <article class="card table-card" style="margin-top:14px">
        <h3 style="margin:0 0 10px;font:600 14px Manrope">Dina önskemål (${wishlistItems.length})</h3>
        <div class="command-list">${list}</div>
      </article>`;
}

function bindWishlist() {
  const sendBtn = document.querySelector('#sendWish');
  if (sendBtn) sendBtn.onclick = () => {
    const textEl = document.querySelector('#wishText');
    const text = textEl.value.trim();
    if (!text) { toast('Skriv ett önskemål först'); return; }
    wishlistItems.unshift({ text, date: Date.now() });
    saveWishlistItems();
    const subject = encodeURIComponent('VYRA önskemål');
    const body = encodeURIComponent(text);
    window.location.href = `mailto:${WISHLIST_EMAIL}?subject=${subject}&body=${body}`;
    renderWishlist();
    toast('Önskemål sparat — e-postklienten öppnas');
  };
  document.querySelectorAll('[data-wish]').forEach(b => b.onclick = () => {
    wishlistItems.splice(+b.dataset.wish, 1);
    saveWishlistItems();
    renderWishlist();
  });
}

function renderWishlist() {
  if (!document.querySelector('[data-extra="wishlist"]')?.classList.contains('active')) return;
  document.querySelector('#title').textContent = 'Önskemål';
  document.querySelector('#view').innerHTML = wishlistHtml();
  bindWishlist();
}
document.addEventListener('click', e => { if (e.target.closest('[data-extra="wishlist"]')) setTimeout(renderWishlist, 0); }, true);
