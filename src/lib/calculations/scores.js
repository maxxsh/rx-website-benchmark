const WEIGHTS = {
  crux: 0.4,
  lighthouse: 0.35,
  a11y: 0.2,
  readability: 0.05,
};

const COMPONENT_KEYS = ["crux", "lighthouse", "a11y", "readability"];

function isMissing(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

function toNumber(value) {
  if (isMissing(value)) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mean(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function buildComponentScores(row, medianK) {
  return {
    crux: computeCruxScore(row),
    lighthouse: computeLighthouseScore(row),
    a11y: computeA11yScore(row, medianK),
    readability: computeReadabilityScore(row),
  };
}

function getAvailableComponents(componentScores) {
  return COMPONENT_KEYS.map((key) => ({
    key,
    score: componentScores[key],
  })).filter((component) => component.score !== null);
}

function computeWeightedAverage(components) {
  if (!components.length) {
    return null;
  }

  const weightedSum = components.reduce(
    (sum, component) => sum + WEIGHTS[component.key] * component.score,
    0,
  );
  const weightTotal = components.reduce(
    (sum, component) => sum + WEIGHTS[component.key],
    0,
  );

  return weightTotal ? weightedSum / weightTotal : null;
}

function computeWeightedFullScore(componentScores) {
  const allPresent = COMPONENT_KEYS.every(
    (key) => componentScores[key] !== null,
  );
  if (!allPresent) {
    return null;
  }

  return COMPONENT_KEYS.reduce(
    (sum, key) => sum + WEIGHTS[key] * componentScores[key],
    0,
  );
}

export function cruxCategoryToPoints(category) {
  const numeric = toNumber(category);
  if (numeric === null || ![1, 2, 3].includes(numeric)) {
    return null;
  }

  return (numeric - 1) * 50;
}

export function computeCruxScore(row) {
  const loading = cruxCategoryToPoints(row["Loading Performance"]);
  const interactivity = cruxCategoryToPoints(row["Interactivity"]);
  const stability = cruxCategoryToPoints(row["Visual Stability"]);

  if (loading === null || interactivity === null || stability === null) {
    return null;
  }

  return mean([loading, interactivity, stability]);
}

export function computeLighthouseScore(row) {
  const performance = toNumber(row["LH Performance"]);
  const bestPractices = toNumber(row["LH Best Practices"]);
  const seo = toNumber(row["LH SEO"]);

  if (performance === null || bestPractices === null || seo === null) {
    return null;
  }

  return (performance + bestPractices + seo) / 3;
}

export function computeA11yIssueBurden(row) {
  const a = toNumber(row["Pa11y A"]);
  const aa = toNumber(row["Pa11y AA"]);

  if (a === null || aa === null) {
    return null;
  }

  return a + 0.5 * aa;
}

export function computeA11yMedianK(rows) {
  const values = rows
    .map((row) => computeA11yIssueBurden(row))
    .filter((value) => value !== null && value >= 0)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return null;
  }

  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  return median === 0 ? 1 : median;
}

export function computeA11yScore(row, medianK) {
  const issueBurden = computeA11yIssueBurden(row);
  if (issueBurden === null || medianK === null) {
    return null;
  }

  return 100 * Math.exp(-issueBurden / medianK);
}

export function computeReadabilityScore(row) {
  return toNumber(row["READ_S"]);
}

export function computeFullcaseScore(row, medianK) {
  const componentScores = buildComponentScores(row, medianK);
  return computeWeightedFullScore(componentScores);
}

export function computePrimaryScore(row, medianK) {
  const componentScores = buildComponentScores(row, medianK);
  const components = getAvailableComponents(componentScores);
  return computeWeightedAverage(components);
}

export function computeAllScores(rows) {
  const medianK = computeA11yMedianK(rows);

  return rows.map((row) => {
    const componentScores = buildComponentScores(row, medianK);
    const score = computeWeightedAverage(
      getAvailableComponents(componentScores),
    );
    const fScore = computeWeightedFullScore(componentScores);

    return {
      Score: score,
      FScore: fScore,
    };
  });
}
