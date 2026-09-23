function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function toNullableNumber(value) {
  if (isNumber(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) {
    return null;
  }

  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sortedValues[base + 1] !== undefined) {
    return (
      sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base])
    );
  }

  return sortedValues[base];
}

function percent(count, total) {
  if (!total) {
    return null;
  }
  return (count / total) * 100;
}

function mean(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function getCruxEntry(row, cruxData) {
  if (!row?.redirect) return null;
  return row.crux ?? cruxData?.[row.redirect] ?? null;
}

function getCruxMetricValue(row, key, cruxData) {
  const entry = getCruxEntry(row, cruxData);
  if (!entry) {
    return null;
  }

  const directValue = entry[key];
  if (directValue !== null && directValue !== undefined) {
    return directValue;
  }

  const fullValue = entry.fullDataRange?.[key];
  if (fullValue !== null && fullValue !== undefined) {
    return fullValue;
  }

  return null;
}

function parseDeviceShares(deviceString) {
  if (!deviceString || typeof deviceString !== "string") {
    return null;
  }

  const parts = deviceString.split("/").map((s) => s.trim());
  if (parts.length !== 3) {
    return null;
  }

  const phone = toNullableNumber(parts[0]);
  const tablet = toNullableNumber(parts[1]);
  const desktop = toNullableNumber(parts[2]);

  if (!isNumber(phone) || !isNumber(tablet) || !isNumber(desktop)) {
    return null;
  }

  const sum = phone + tablet + desktop;
  if (sum < 95 || sum > 105) {
    return null;
  }

  return { phone, tablet, desktop };
}

function getDominantDevice(deviceShares) {
  if (!deviceShares) {
    return null;
  }

  const { phone, tablet, desktop } = deviceShares;
  const devices = [
    { key: "phone", value: phone },
    { key: "tablet", value: tablet },
    { key: "desktop", value: desktop },
  ];

  devices.sort((a, b) => b.value - a.value);

  // Tie-break: mobile > desktop > tablet
  if (devices[0].value > devices[1].value) {
    return devices[0].key;
  }

  // Tie, apply order
  const tieBreakers = ["phone", "desktop", "tablet"];
  for (const key of tieBreakers) {
    if (devices.some((d) => d.key === key && d.value === devices[0].value)) {
      return key;
    }
  }

  return null;
}

export function summarizeScores(rows, cruxData) {
  const totalRows = rows.length;

  // Match Supplementary Table S1: summarize the per-homepage scores
  // rounded to one decimal, as displayed in the benchmark table.
  // Keep the underlying component and composite calculations at full precision.
  const scoreValues = rows
    .map((row) => row.score)
    .filter((value) => isNumber(value))
    .map((value) => Math.round(value * 10) / 10)
    .sort((a, b) => a - b);

  const fScoreValues = rows
    .map((row) => row.FScore)
    .filter((value) => isNumber(value))
    .map((value) => Math.round(value * 10) / 10)
    .sort((a, b) => a - b);

  const withFScore = fScoreValues.length;

  let noCrux = 0;
  let noContent = 0;
  let noLh = 0;
  let auditFail = 0;

  rows.forEach((row) => {
    const loadingPerformance = toNullableNumber(
      getCruxMetricValue(row, "loadingPerformance", cruxData),
    );
    const interactivity = toNullableNumber(
      getCruxMetricValue(row, "interactivity", cruxData),
    );
    const visualStability = toNullableNumber(
      getCruxMetricValue(row, "visualStability", cruxData),
    );

    const hasCrux =
      isNumber(loadingPerformance) ||
      isNumber(interactivity) ||
      isNumber(visualStability);
    const hasContent = isNumber(row.readScore);
    const hasLh =
      isNumber(row.performance) ||
      isNumber(row.bestPractices) ||
      isNumber(row.seo);

    if (!hasCrux) noCrux += 1;
    if (!hasContent) noContent += 1;
    if (!hasLh) noLh += 1;
    if (!hasCrux && !hasContent && !hasLh) auditFail += 1;
  });

  return {
    totalRows,
    withFScore,
    noCrux,
    noContent,
    noLh,
    auditFail,
    scoreMedian: quantile(scoreValues, 0.5),
    scoreQ1: quantile(scoreValues, 0.25),
    scoreQ3: quantile(scoreValues, 0.75),
    fScoreMedian: quantile(fScoreValues, 0.5),
    fScoreQ1: quantile(fScoreValues, 0.25),
    fScoreQ3: quantile(fScoreValues, 0.75),
  };
}

export function summarizeComponents(rows, cruxData) {
  const totalRows = rows.length;

  const cruxMetricMap = {
    loadingPerformance: "LP",
    interactivity: "INT",
    visualStability: "VS",
  };

  const rowsWithAnyCrux = rows.filter((row) => {
    const loadingPerformance = toNullableNumber(
      getCruxMetricValue(row, "loadingPerformance", cruxData),
    );
    const interactivity = toNullableNumber(
      getCruxMetricValue(row, "interactivity", cruxData),
    );
    const visualStability = toNullableNumber(
      getCruxMetricValue(row, "visualStability", cruxData),
    );

    return (
      isNumber(loadingPerformance) ||
      isNumber(interactivity) ||
      isNumber(visualStability)
    );
  });

  const cruxSummary = Object.entries(cruxMetricMap).reduce(
    (acc, [key, label]) => {
      const values = rowsWithAnyCrux
        .map((row) => toNullableNumber(getCruxMetricValue(row, key, cruxData)))
        .filter((value) => isNumber(value));

      const presentCount = values.length;
      const goodCount = values.filter((value) => value === 3).length;
      const niCount = values.filter((value) => value === 2).length;
      const poorCount = values.filter((value) => value === 1).length;

      const metricValuesAll = rows
        .map((row) => toNullableNumber(getCruxMetricValue(row, key, cruxData)))
        .filter((value) => isNumber(value));
      const missingCount = totalRows - metricValuesAll.length;

      acc[key] = {
        label,
        goodPct: percent(goodCount, presentCount),
        niPct: percent(niCount, presentCount),
        poorPct: percent(poorCount, presentCount),
        missingPct: percent(missingCount, totalRows),
      };
      return acc;
    },
    {},
  );

  const aValues = rows
    .map((row) => toNullableNumber(row.pa11yErrorsA))
    .filter((value) => isNumber(value))
    .sort((a, b) => a - b);
  const aaValues = rows
    .map((row) => toNullableNumber(row.pa11yErrorsAA))
    .filter((value) => isNumber(value))
    .sort((a, b) => a - b);

  const aZeroCount = aValues.filter((value) => value === 0).length;
  const aaZeroCount = aaValues.filter((value) => value === 0).length;

  const lighthouseMetrics = {
    performance: "LH Performance",
    bestPractices: "LH Best Practices",
    seo: "LH SEO",
  };

  const lighthouseSummary = Object.entries(lighthouseMetrics).reduce(
    (acc, [key, label]) => {
      const values = rows
        .map((row) => toNullableNumber(row[key]))
        .filter((value) => isNumber(value))
        .map((value) => value * 100)
        .sort((a, b) => a - b);

      acc[key] = {
        label,
        median: quantile(values, 0.5),
        q1: quantile(values, 0.25),
        q3: quantile(values, 0.75),
      };
      return acc;
    },
    {},
  );

  // Per-device summary (Phone, Tablet, Desktop, by dominant device)
  const deviceTypes = ["phone", "tablet", "desktop"];
  const deviceRows = rows
    .map((row) => {
      const deviceShares = parseDeviceShares(row["Devices %"]);
      const fScore = toNullableNumber(row.FScore);
      const dominant = deviceShares ? getDominantDevice(deviceShares) : null;
      return { deviceShares, fScore, dominant };
    })
    .filter(
      (entry) => entry.deviceShares && deviceTypes.includes(entry.dominant),
    );

  const deviceCount = deviceRows.length;
  const missingDeviceCount = totalRows - deviceCount;

  // Compute average shares over ALL device-valid rows
  const avgPhoneShare = mean(
    deviceRows.map((entry) => entry.deviceShares.phone),
  );
  const avgTabletShare = mean(
    deviceRows.map((entry) => entry.deviceShares.tablet),
  );
  const avgDesktopShare = mean(
    deviceRows.map((entry) => entry.deviceShares.desktop),
  );

  const deviceSummary = {};
  for (const type of deviceTypes) {
    const filtered = deviceRows.filter((entry) => entry.dominant === type);
    const count = filtered.length;
    const percentOfTotal = percent(count, totalRows);
    const avgUsage =
      type === "phone"
        ? avgPhoneShare
        : type === "tablet"
          ? avgTabletShare
          : avgDesktopShare;
    const avgFScore = mean(
      filtered.map((entry) => entry.fScore).filter(isNumber),
    );
    deviceSummary[type] = {
      count,
      percentOfTotal,
      avgUsage,
      avgFScore,
    };
  }

  // Readability metrics summary
  const readabilityMetrics = [
    { key: "fleschKincaid", label: "FRE" },
    { key: "gunningFog", label: "GF Index" },
    { key: "spellingError", label: "Spell %" },
    { key: "wordCount", label: "Words" },
  ];
  const readability = {};
  for (const { key, label } of readabilityMetrics) {
    const values = rows
      .map((row) => toNullableNumber(row[key]))
      .filter((value) => isNumber(value))
      .sort((a, b) => a - b);
    readability[key] = {
      label,
      median: quantile(values, 0.5),
      q1: quantile(values, 0.25),
      q3: quantile(values, 0.75),
    };
  }

  return {
    crux: cruxSummary,
    totalRows,
    pa11y: {
      aMedian: quantile(aValues, 0.5),
      aQ1: quantile(aValues, 0.25),
      aQ3: quantile(aValues, 0.75),
      aZeroPct: percent(aZeroCount, aValues.length),
      aaMedian: quantile(aaValues, 0.5),
      aaQ1: quantile(aaValues, 0.25),
      aaQ3: quantile(aaValues, 0.75),
      aaZeroPct: percent(aaZeroCount, aaValues.length),
    },
    lighthouse: lighthouseSummary,
    devices: {
      summary: deviceSummary,
      withDeviceCount: deviceCount,
      missingCount: missingDeviceCount,
      missingPct: percent(missingDeviceCount, totalRows),
    },
    readability,
  };
}
