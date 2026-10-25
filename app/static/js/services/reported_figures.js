/**
 * Figures reported by RBTC Eldoret and KNBTS, copied exactly as printed on the
 * posted reports. Edit the numbers here; the Overview charts, tables and
 * summary cards all read from this file. Totals are summed, never typed in.
 */
window.UhaiReported = (function () {
  'use strict';

  const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

  // RBTC Eldoret: whole blood collection, FY 2025/26
  const monthly = [
    { month: 'July 2025', collection: 1791 },
    { month: 'August 2025', collection: 1650 },
    { month: 'September 2025', collection: 1924 },
    { month: 'October 2025', collection: 1662 },
    { month: 'November 2025', collection: 1989 },
    { month: 'December 2025', collection: 1837 },
    { month: 'January 2026', collection: 1970 },
    { month: 'February 2026', collection: 1914 },
    { month: 'March 2026', collection: 1931 },
    { month: 'April 2026', collection: 1897 },
    { month: 'May 2026', collection: 1934 },
    { month: 'June 2026', collection: 2113 }
  ];

  // National achievement against the minimum national blood need, FY 2023/24
  const target = {
    year: 'FY 2023/24',
    collected: 357517,          // whole blood units collected in the country
    need: 536924,               // minimum national need, blood and blood components
    achievementPct: 67          // as printed
  };

  // RBTC Eldoret: quarterly collection, components and discards, FY 2024/25
  const quarterly = [
    { quarter: 'Q1', collection: 5398, grouping: 5398, screening: 9406, components: 12955, discards: 286 },
    { quarter: 'Q2', collection: 4981, grouping: 4981, screening: 8412, components: 11954, discards: 181 },
    { quarter: 'Q3', collection: 5540, grouping: 5540, screening: 7980, components: 13296, discards: 299 },
    { quarter: 'Q4', collection: 5327, grouping: 5327, screening: 8533, components: 12784, discards: 154 }
  ];

  // RBTC Eldoret: quarterly report, FY 2025/26
  const quarterlyReport = [
    { quarter: 'Q1', collection: 5413, counselling: 6197, cme: 3, sessions: 6, apheretic: 148, postDonation: 5413 },
    { quarter: 'Q2', collection: 5806, counselling: 6438, cme: 3, sessions: 4, apheretic: 139, postDonation: 5806 },
    { quarter: 'Q3', collection: 5756, counselling: 6526, cme: 3, sessions: 3, apheretic: 94, postDonation: 5756 },
    { quarter: 'Q4', collection: 5944, counselling: 6928, cme: 3, sessions: 3, apheretic: 161, postDonation: 5944 }
  ];

  function totals(rows, keys) {
    return keys.reduce((t, k) => { t[k] = sum(rows, k); return t; }, {});
  }

  // Discards as a percentage of collection (donations) in the same period
  const discardPct = r => r.collection ? 100 * r.discards / r.collection : null;
  quarterly.forEach(r => { r.discardPct = discardPct(r); });

  const quarterlyTotals = totals(quarterly, ['collection', 'grouping', 'screening', 'components', 'discards']);
  quarterlyTotals.discardPct = discardPct(quarterlyTotals);

  return {
    monthly, target, quarterly, quarterlyReport,
    monthlyTotal: sum(monthly, 'collection'),
    quarterlyTotals,
    quarterlyReportTotals: totals(quarterlyReport, ['collection', 'counselling', 'cme', 'sessions', 'apheretic', 'postDonation'])
  };
})();
