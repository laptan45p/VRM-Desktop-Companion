'use strict';

// Ratios are relative to CSS pixels, independently of avatar/window scale.
function pixelRatio(width, height, deviceRatio = 1, maxDimension = 8192) {
  width = Number.isFinite(width) && width > 0 ? width : 1;
  height = Number.isFinite(height) && height > 0 ? height : 1;
  deviceRatio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  maxDimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 8192;
  const desired = Math.min(3, Math.max(2, deviceRatio));
  const budget = 16000000;
  return Math.min(desired, Math.sqrt(budget / (width * height)),
    maxDimension / width, maxDimension / height);
}

module.exports = {pixelRatio};
