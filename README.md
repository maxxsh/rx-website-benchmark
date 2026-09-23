# Prescription Drug Website Benchmark

**Performance, accessibility, and readable content for patient-facing web experiences.**

A research and engineering project examining **338 official U.S. prescription drug brand homepages**. It brings together saved audits, field experience data, content analysis, and a SvelteKit companion website to make the quality of healthcare interfaces easier to inspect and discuss.

**[View online →](https://rxwebbench.pages.dev/)**

## Why this matters

A medication website is often the first step toward prescribing information, safety disclosures, and patient support. Loading delays, shifting layouts, inaccessible controls, and dense text can add friction at that entry point.

This project connects frontend implementation with interface design and health-information access. Designers can use the findings to frame design reviews; developers can trace measurements to saved reports; researchers can inspect the sampling and scoring workflow.

## Four perspectives on the experience

|                                                                                                  | Assessment                                                                            | What it helps a team examine                                                                                                                                                                                     |
| :----------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  <img src="static/assets/img/lighthouse-icon.svg" width="32" height="32" alt="Lighthouse logo">  | **[Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/)** · Lab audits | Loading performance, implementation best practices, and discoverability. Connect technical findings with page weight, assets, and frontend delivery decisions.                                                   |
|       <img src="static/assets/img/pa11y-icon.svg" width="32" height="32" alt="Pa11y logo">       | **[Pa11y](https://pa11y.org/)** · Automated accessibility                             | Potential barriers involving contrast, text alternatives, labels, and semantics. Give design and engineering teams concrete issues to investigate together.                                                      |
| <img src="static/assets/img/crux.svg" width="32" height="32" alt="Field experience chart icon">  | **[CrUX](https://developer.chrome.com/docs/crux/)** · Field experience                | Loading, responsiveness, and layout stability experienced by eligible Chrome users. Add field evidence alongside lab measurements, where data are available.                                                     |
| <img src="static/assets/img/readability.svg" width="32" height="32" alt="Readable content icon"> | **Readability** · Content analysis                                                    | Text extracted with [Mozilla Readability](https://github.com/mozilla/readability), evaluated using Flesch Reading Ease, Gunning Fog, and word count. Inform content reviews while accounting for short extracts. |

Readability is a project pipeline, combining several tools and scoring rules. Automated checks identify signals for review; accessibility findings do not establish WCAG conformance, and readability formulas do not directly measure patient comprehension.

## Selected findings

| Study finding                                                               | Relevance to interface design                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **56 / 100** median Lighthouse Performance                                  | Performance deserves attention alongside visual presentation and content structure.                                                      |
| **7** median Level A accessibility findings per homepage; **2.7%** had zero | Accessibility checks need to be part of component design, implementation, and review.                                                    |
| **20.4%** of homepages with visual-stability data were classified as Poor   | Layout stability is a meaningful part of the reading and interaction experience. The denominator is the **269** homepages with CLS data. |

The composite **Score** had a median of **67.1 / 100** (interquartile range **57.4–75.3**). Individual dimensions provide the detail needed to investigate a homepage; the composite provides a common summary for comparison.

These are observations from the saved study dataset. They describe homepage delivery and do not evaluate clinical accuracy, treatment effectiveness, or the quality of every page on a website.

## Explore the evidence

- **[Home](https://rxwebbench.pages.dev/):** sortable per-homepage measurements, composite scores, and links to saved audit reports.
- **[Results](https://rxwebbench.pages.dev/results):** aggregate statistics, data coverage, and CrUX and Pa11y visualizations.
- **This repository:** collection scripts, curated homepage lists, saved outputs, and the implementation behind the companion site.

In the table's **Reports** column, Lighthouse and Pa11y links open saved audit outputs. **Vis** opens the live CrUX visualization: it shows data currently available in that service and does not reproduce the study snapshot. The table itself uses the saved dataset.

## Research

**Regulated Medication Information, Accessible Web Delivery? A Cross-Sectional Evaluation of United States Prescription Drug Brand Homepages**  
Max Shestov and Christopher Felix Brewer  
[Universal Access in the Information Society · Springer](https://link.springer.com/journal/10209)

The companion code connects four parts of the research workflow:

1. **Sample construction:** CMS Medicare Part D data and openFDA eligibility validation establish the candidate pool.
2. **Manual verification:** candidate destinations are inspected to identify official brand homepages, resolve canonical URLs, and exclude ineligible sites. The study retained 338 homepages from 661 eligible brands.
3. **Measurement and recovery:** audits and text extraction use the selected URLs; saved local HTML supports readability recovery when automatic extraction fails.
4. **Analysis and presentation:** scoring functions and summaries turn the saved measurements into a navigable benchmark, with access to the underlying reports.

### How the summary score works

| Component                         | Weight |
| --------------------------------- | -----: |
| CrUX field experience             |    40% |
| Lighthouse implementation quality |    35% |
| Pa11y accessibility issue burden  |    20% |
| Confidence-adjusted readability   |     5% |

**Score** uses available component subscores with renormalized weights. **FScore** is reported only when all four subscores are available. The current implementation requires all three CrUX dimensions for its CrUX subscore. Missing data remain distinct from a measured zero.

Calculations retain full precision. For Score and FScore medians and quartiles, per-homepage values are first rounded to one decimal place, matching the benchmark table and Supplementary Table S1; the summaries are then displayed to one decimal place. The scoring implementation is in [`src/lib/calculations/`](src/lib/calculations/).

## Run locally

Use **Node.js 22.12 or later** and npm. From the repository root:

```sh
npm install
npm run dev
```

Open the URL printed in the terminal. The saved dataset is included, so exploring the site requires no API key or new audits.

To build and preview the static site:

```sh
npm run build
npm run preview
```

The build output is `build/`. The application uses **SvelteKit, Svelte, and Tailwind CSS**; data collection and processing use Node.js.

## Collect and process data

The following workflow is for collecting or updating measurements. New runs can replace saved outputs and reflect changed websites or tool versions. Preserve the study snapshot when creating a new dataset.

<details>
<summary><strong>Dataset preparation and audit commands</strong></summary>

### 1. Prepare and verify the homepage list

```sh
npm run step1
npm run step2
npm run step3
```

| Step                                           | Output in `static/script-data/` |
| ---------------------------------------------- | ------------------------------- |
| `step1` · retrieve and filter CMS candidates   | `medicare-drugs-list.json`      |
| `step2` · validate eligibility against openFDA | `fda-validated-final-list.json` |
| `step3` · generate candidate website addresses | `working-list-final.json`       |

**Complete manual homepage verification before continuing.** Record approved brands and their final audited URLs in [`src/lib/manully-validated-338.csv`](src/lib/manully-validated-338.csv). The saved working list already reflects prior curation. Canonical URLs must remain consistent with the saved reports because they connect measurements across tools.

```sh
npm run step4
npm run step5
```

`step4` selects approved candidates and writes `static/script-data/validated-working-list-final.json`. `step5` generates `src/lib/sites.txt`, `.pa11yci-a.json`, and `.pa11yci-aa.json`.

### 2. Lighthouse

```sh
npm run lighthouse
```

Reports are saved in `static/lighthouse/`. The command invokes `lighthouse-batch` through `npx`; that package is not currently pinned in the project dependencies or lockfile. Record the tool version and audit settings for a new collection.

### 3. Pa11y

```sh
npm run pa11y:a
npm run pa11y:aa
npm run group-al11y:a
npm run group-al11y:aa
```

Each audit writes HTML reports and `results.json` to its standard folder, `static/pa11y/A/` or `static/pa11y/AA/`. Grouping produces `grouped-results.json` in the same folder.

For a targeted run, edit the URL list in `.pa11yci-manual.json` and run:

```sh
npm run pa11y:manual
```

This configuration currently targets Invokana, including a screenshot run, and writes to `static/pa11y/TEMP/`. These outputs do not feed the benchmark summaries. "Manual" refers to selecting the URLs; the checks are automated.

### 4. CrUX

Copy `.env.example` to `.env` and insert your own CrUX API key:

```dotenv
CRUX_API_KEY=your_crux_api_key_here
```

```sh
npm run crux
```

The command loads `.env` automatically; the file is excluded from version control. Results go to `static/crux/crux-grouped-results.json`. Existing successful records are retained and skipped, so rerunning does not refresh every URL. The file timestamp records the script run, not a new measurement date for every retained record.

### 5. Readability

```sh
npm run readability
```

The script reads `src/lib/sites.txt` and writes `static/readable/grouped-results.json`. When extraction fails despite readable content being visible during manual inspection, save the homepage HTML in `static/local-pages/` and run:

```sh
npm run manual-readability
node scripts/merge-readable-results.js
```

Local results are saved in `manual-grouped-results.json`. Matching local-page measurements override automated results in `combined-readable-results.json` and are marked `manualTest: true`. Review the merge log for unmatched filenames. The website reads the combined file.

After updating data, run `npm run build` and publish the updated `build/` output to update the companion site.

</details>

## Repository guide

| Location                                                                  | Contents                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`scripts/`](scripts/)                                                    | Sampling, collection, accessibility grouping, and readability processing        |
| [`src/lib/calculations/`](src/lib/calculations/)                          | Component scoring, composite scores, and descriptive summaries                  |
| [`src/lib/server/benchmark.js`](src/lib/server/benchmark.js)              | Assembly of saved measurements for the table at build time and the Results page |
| [`src/routes/`](src/routes/)                                              | SvelteKit pages and route handlers                                              |
| [`static/script-data/`](static/script-data/)                              | Candidate and verified homepage lists                                           |
| `static/lighthouse/`, `static/pa11y/`, `static/crux/`, `static/readable/` | Saved audit outputs and analysis inputs                                         |
| [`static/local-pages/`](static/local-pages/)                              | Saved HTML used for readability recovery                                        |

## License

Original project code and documentation are available under the [MIT License](LICENSE). Third-party dependencies, website HTML, screenshots, fonts, and third-party material embedded in reports retain their respective licenses and rights.
