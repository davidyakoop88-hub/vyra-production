(() => {
  const params = new URLSearchParams(location.search);
  const effect = window.VyraGavofyrverkeri;
  effect.setProfile(params.get('profile'));
  effect.setStyle(params.get('style'));
  effect.setGift(params.get('gift')).then(key => effect.launch(key, Number(params.get('combo'))));
})();