'use strict';

function cleanQuality(value) {
  return ['high', 'medium', 'low'].includes(value) ? value : 'high';
}

// Ratios are relative to CSS pixels, independently of avatar/window scale.
function pixelRatio(quality, width, height, deviceRatio = 1, maxDimension = 8192) {
  width = Number.isFinite(width) && width > 0 ? width : 1;
  height = Number.isFinite(height) && height > 0 ? height : 1;
  deviceRatio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  maxDimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 8192;
  const mode = cleanQuality(quality);
  const desired = mode === 'high' ? Math.min(3, Math.max(2, deviceRatio))
    : mode === 'medium' ? Math.min(1.5, deviceRatio) : Math.min(.75, deviceRatio);
  const budget = mode === 'high' ? 16000000 : mode === 'medium' ? 8000000 : 2000000;
  return Math.min(desired, Math.sqrt(budget / (width * height)),
    maxDimension / width, maxDimension / height);
}

module.exports = {cleanQuality, pixelRatio};
