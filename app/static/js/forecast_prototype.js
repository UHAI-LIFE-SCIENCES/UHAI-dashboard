/**
 * FORECAST PROTOTYPE — NOT A VALIDATED MODEL.
 *
 * Ordinary least-squares linear trend fitted to complete monthly totals, with
 * an 80% prediction interval. It exists so the Forecasting page can be laid
 * out and reviewed. Replace project() with a call to UHAI's validated model
 * (the pitch deck references one; it is not connected) before any operational use.
 */
window.UhaiForecast = (function () {
  'use strict';

  const Z80 = 1.2816;

  /**
   * Drop a trailing period that looks incomplete (< 60% of the median of the
   * earlier periods). Returns { values, labels, dropped }.
   */
  function completePeriods(labels, values) {
    const n = values.length;
    if (n < 4) return { labels, values, dropped: null };
    const earlier = values.slice(0, n - 1).filter(v => v !== null).sort((a, b) => a - b);
    const median = earlier[Math.floor(earlier.length / 2)];
    if (values[n - 1] !== null && values[n - 1] < 0.6 * median) {
      return { labels: labels.slice(0, n - 1), values: values.slice(0, n - 1), dropped: labels[n - 1] };
    }
    return { labels, values, dropped: null };
  }

  function nextMonths(lastLabel, h) {
    let [y, m] = lastLabel.split('-').map(Number);
    const out = [];
    for (let i = 0; i < h; i++) {
      if (++m > 12) { m = 1; y++; }
      out.push(y + '-' + String(m).padStart(2, '0'));
    }
    return out;
  }

  /**
   * project(values, horizon) -> { point[], lower[], upper[], slope, n, residualSd }
   */
  function project(values, horizon) {
    const n = values.length;
    if (n < 3) return null;
    const xs = values.map((_, i) => i);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - xMean) ** 2; sxy += (x - xMean) * (values[i] - yMean); });
    const slope = sxy / sxx;
    const intercept = yMean - slope * xMean;
    const sse = values.reduce((s, y, i) => s + (y - (intercept + slope * i)) ** 2, 0);
    const sd = Math.sqrt(sse / Math.max(1, n - 2));

    const point = [], lower = [], upper = [];
    for (let k = 0; k < horizon; k++) {
      const x = n + k;
      const yhat = Math.max(0, intercept + slope * x);
      const se = sd * Math.sqrt(1 + 1 / n + (x - xMean) ** 2 / sxx);
      point.push(Math.round(yhat));
      lower.push(Math.max(0, Math.round(yhat - Z80 * se)));
      upper.push(Math.round(yhat + Z80 * se));
    }
    return { point, lower, upper, slope, n, residualSd: sd };
  }

  return { completePeriods, nextMonths, project, METHOD: 'Linear trend (OLS) on complete monthly totals, 80% prediction interval' };
})();
