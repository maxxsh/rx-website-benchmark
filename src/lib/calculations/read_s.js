const FRE_MIN = 0;
const FRE_MAX = 100;
const FOG_MIN = 8;
const FOG_MAX = 17;
const WORDS_LOW_CONFIDENCE = 100;
const WORDS_FULL_CONFIDENCE = 300;

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Step 1 + 2 + 3: base readability score (READ_S)
export function read_s_base(fleschReadingEase, gunningFogIndex) {
  if (!isNumber(fleschReadingEase) || !isNumber(gunningFogIndex)) {
    return null;
  }

  const freBounded = clamp(fleschReadingEase, FRE_MIN, FRE_MAX);
  const fogClamped = clamp(gunningFogIndex, FOG_MIN, FOG_MAX);
  const fogScaled = 100 * ((FOG_MAX - fogClamped) / (FOG_MAX - FOG_MIN));

  return 0.8 * freBounded + 0.2 * fogScaled;
}

// Step 5: dataset reference readability (median READ_S for W >= 300)
export function read_s_ref(readableResults) {
  const scores = Object.values(readableResults)
    .map((entry) => {
      const baseScore = read_s_base(
        entry?.fleschKincaidReadingEase,
        entry?.gunningFogIndex,
      );

      if (
        !isNumber(entry?.wordCount) ||
        entry.wordCount < WORDS_FULL_CONFIDENCE
      ) {
        return null;
      }

      return baseScore;
    })
    .filter(isNumber)
    .sort((a, b) => a - b);

  if (scores.length === 0) {
    return null;
  }

  const mid = Math.floor(scores.length / 2);
  return scores.length % 2 === 0
    ? (scores[mid - 1] + scores[mid]) / 2
    : scores[mid];
}

// Step 4 + 6: confidence-adjusted readability (READ_S*)
export function read_s(fleschReadingEase, gunningFogIndex, wordCount, readRef) {
  const baseScore = read_s_base(fleschReadingEase, gunningFogIndex);
  if (!isNumber(baseScore) || !isNumber(wordCount)) {
    return null;
  }

  const confidenceWeight = clamp(
    (wordCount - WORDS_LOW_CONFIDENCE) /
      (WORDS_FULL_CONFIDENCE - WORDS_LOW_CONFIDENCE),
    0,
    1,
  );

  if (!isNumber(readRef)) {
    return baseScore;
  }

  return confidenceWeight * baseScore + (1 - confidenceWeight) * readRef;
}
