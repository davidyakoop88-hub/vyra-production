(function (global) {
  'use strict';

  var models = ['lion', 'dragon', 'phoenix', 'panther', 'peacock'];
  var pending = Object.create(null);
  var base = document.currentScript && document.currentScript.src;

  function load(model) {
    if (models.indexOf(model) === -1) {
      return Promise.reject(new Error('Okänd burkmodell: ' + model));
    }
    if (pending[model]) return pending[model];
    pending[model] = new Promise(function (resolve, reject) {
      var source = new Image();
      source.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = source.naturalWidth;
          canvas.height = source.naturalHeight;
          var context = canvas.getContext('2d');
          if (!context) throw new Error('Bildytan kunde inte skapas.');
          // Preserve the supplied artwork and its authored alpha unchanged.
          context.drawImage(source, 0, 0);
          resolve(canvas);
        } catch (error) {
          delete pending[model];
          reject(error);
        }
      };
      source.onerror = function () {
        delete pending[model];
        reject(new Error('Burkbilden kunde inte laddas: ' + model));
      };
      source.src = new URL('assets/gift-jars/' + model + '.png', base || document.baseURI).href;
    });
    return pending[model];
  }

  global.VyraGiftJarTextures = Object.freeze({ load: load });
})(window);
