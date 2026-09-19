(function (root) {
  'use strict';

  const styles = Object.freeze([
    Object.freeze(['clean-bar', 'VYRA Clean Bar']),
    Object.freeze(['soft-stack', 'VYRA Soft Stack']),
    Object.freeze(['mini-podium', 'VYRA Mini Podium']),
    Object.freeze(['side-rank', 'VYRA Side Rank'])
  ]);
  const defaults = Object.freeze({
    'clean-bar': Object.freeze({
      id: 'clean-bar', name: 'VYRA Clean Bar', layout: 'clean', frame: 'minimal-glow', count: 5
    }),
    'soft-stack': Object.freeze({
      id: 'soft-stack', name: 'VYRA Soft Stack', layout: 'clean', frame: 'minimal-glow', count: 5
    }),
    'mini-podium': Object.freeze({
      id: 'mini-podium', name: 'VYRA Mini Podium', layout: 'center', frame: 'minimal-glow', count: 5
    }),
    'side-rank': Object.freeze({
      id: 'side-rank', name: 'VYRA Side Rank', layout: 'right', frame: 'minimal-glow', count: 5
    })
  });

  root.VYRA_TOPLIKE_STYLES = styles;
  root.VYRA_TOPLIKE_DEFAULTS = defaults;
  root.applyVyraTopLikeStyle = function applyVyraTopLikeStyle(widget, id) {
    const preset = defaults[id];
    if (!widget || !preset) return false;
    widget.skin = preset.id;
    widget.likeTheme = preset.layout;
    widget.likeCount = preset.count;
    widget.profileFrame = preset.frame;
    widget.width = preset.id === 'mini-podium' ? 300 : preset.id === 'side-rank' ? 180 : 250;
    widget.showTitle = false;
    widget.showCrown = false;
    widget.autoMedal = false;
    widget.showProfile = true;
    widget.showDataName = true;
    widget.showDataValue = true;
    widget.showBackground = false;
    widget.rankingCycle = false;
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
