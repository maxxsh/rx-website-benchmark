export function getAuditResult(audit) {
  if (!audit || audit.score === null) return null;
  if (audit.score === 1) return "✓";
  if (
    audit.details &&
    audit.details.items &&
    Array.isArray(audit.details.items)
  ) {
    return audit.details.items.length;
  }
  return "✓";
}

export function getVulnerableLibrariesResult(audit) {
  if (!audit || audit.score === 1) return "✓";
  if (
    audit.details &&
    audit.details.items &&
    Array.isArray(audit.details.items)
  ) {
    const highestSeverity = audit.details.items[0]?.severity;
    return highestSeverity || "✓";
  }
  return "✓";
}

export function getLinkButtonTotal(linkAudit, buttonAudit) {
  const linkResult = getAuditResult(linkAudit);
  const buttonResult = getAuditResult(buttonAudit);

  if (linkResult === null && buttonResult === null) {
    return null;
  }

  const linkValue = linkResult === null || linkResult === "✓" ? 0 : linkResult;
  const buttonValue =
    buttonResult === null || buttonResult === "✓" ? 0 : buttonResult;

  return linkValue + buttonValue;
}

export function getHttpsResult(isOnHttpsAudit, redirectsHttpAudit) {
  const isOnHttps = isOnHttpsAudit?.score;
  const redirectsHttp = redirectsHttpAudit?.score;
  return isOnHttps && redirectsHttp ? "✓" : `${isOnHttps}/${redirectsHttp}`;
}

export function processLighthouseReport(
  brand,
  report,
  pa11yData,
  slug,
  options = {},
) {
  const { pa11yAAExists, pa11yAExists } = options;

  return {
    brand: brand.brand,
    website: brand.website,
    redirect: brand.redirect,
    slug: slug,
    lhReportPath: `/lighthouse/${slug.replace(/%/g, "%25")}.report.html`,
    pa11yAAReportPath:
      pa11yAAExists !== false
        ? `/pa11y/AA/${options.pa11ySlug || slug}.html`
        : null,
    pa11yAReportPath:
      pa11yAExists !== false
        ? `/pa11y/A/${options.pa11ySlug || slug}.html`
        : null,
    score: report.categories?.performance?.score ?? null,
    performance: report.categories?.performance?.score ?? null,
    accessibility: report.categories?.accessibility?.score ?? null,
    bestPractices: report.categories?.["best-practices"]?.score ?? null,
    seo: report.categories?.seo?.score ?? null,
    colorContrast: getAuditResult(report.audits["color-contrast"]),
    headingOrder: getAuditResult(report.audits["heading-order"]),
    linkName: getAuditResult(report.audits["link-name"]),
    buttonName: getAuditResult(report.audits["button-name"]),
    linkButtonTotal: getLinkButtonTotal(
      report.audits["link-name"],
      report.audits["button-name"],
    ),
    vulnerableLibraries: getVulnerableLibrariesResult(
      report.audits["no-vulnerable-libraries"],
    ),
    imageAlt: getAuditResult(report.audits["image-alt"]),
    consoleErrors: getAuditResult(report.audits["errors-in-console"]),
    https: getHttpsResult(
      report.audits["is-on-https"],
      report.audits["redirects-http"],
    ),
    pa11yErrorsA: pa11yData.pa11yAErrors ?? null,
    pa11yErrorsAA: pa11yData.pa11yAAErrors ?? null,
    tlh_run_date: report.fetchTime ?? null,
    crux_run_date: null, // Will be set later
    pa11y_run_date: null,
    readability_run_date: null,
  };
}

export function createFallbackData(brand, slug, pa11yData = {}) {
  return {
    brand: brand.brand,
    website: brand.website,
    redirect: brand.redirect,
    slug: slug,
    lhReportPath: null,
    pa11yAAReportPath: null,
    pa11yAReportPath: null,
    score: null,
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
    colorContrast: null,
    headingOrder: null,
    linkName: null,
    buttonName: null,
    linkButtonTotal: null,
    vulnerableLibraries: null,
    imageAlt: null,
    consoleErrors: null,
    https: null,
    pa11yErrorsA: pa11yData.pa11yAErrors ?? null,
    pa11yErrorsAA: pa11yData.pa11yAAErrors ?? null,
    tlh_run_date: null,
    crux_run_date: null,
    pa11y_run_date: null,
    readability_run_date: null,
  };
}
