// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

script({
  model: "github_copilot_chat:gpt-5-mini",
  parameters: {
    directory: {
      type: "string",
      description: "Relative directory to scan for sensitive content",
    },
  },
});

const { output } = env;

let directory = env.vars?.directory;
if (!directory) {
  directory = (await host.input("Directory to scan (default: .)")) || ".";
}

directory = directory.trim() || ".";
const normalizedDirectory =
  directory === "."
    ? "."
    : directory
        .replace(/\\/g, "/")
        .replace(/^\.\/+/, "")
        .replace(/\/+$/, "");
const globPattern = !normalizedDirectory || normalizedDirectory === "."
  ? "**/*"
  : `${normalizedDirectory}/**/*`;

const files = await workspace.findFiles(globPattern, {
  ignore: ["**/node_modules/**", "**/.git/**", "**/.venv/**", "**/dist/**"],
});

const aggregated = {
  results: {},
  summary: {
    directory,
    filesScanned: 0,
    filesWithFindings: 0,
    severityCounts: {},
  },
};

for (const file of files) {
  aggregated.results[file.filename] = [];
  if (!file?.content || !file.content.trim()) continue;

  aggregated.summary.filesScanned += 1;

  let findings = [];

  try {
    const res = await runPrompt((_) => {
      _.def("FILE", file);
      _.def("FILENAME", file.filename);
      _.$`
You are reviewing the source file FILENAME (see FILE) for disallowed or risky public release content.
Instructions:
- Identify ANY of these issues: internal code names, proprietary project names, internal only telemetry/event identifiers, internal UNC or drive paths, Azure subscription IDs, secrets, employee or vendor email aliases, copyright notices mentioning confidential status, references to internal tools, build systems, or proprietary fonts.
- Also flag any TODO/FIXME that exposes internal plans, and any commented stack traces with internal paths.
- Output STRICT JSON ONLY: an array of objects with: severity (WARNING|ERROR|SYSTEMERROR), message, line (number), snippet.
- Do NOT wrap the JSON in quotes or backticks; respond with bare JSON only.
- Do NOT hallucinate. If unsure, respond with SYSTEMERROR as the severity.
- ERROR if: secrets, credentials, subscription IDs, unredacted emails, or clearly confidential code names. Everything else is WARNING.
- Treat the following identifiers as safe; they should never be flagged: @microsoft/vscode-fabric-util, @microsoft/vscode-fabric-api, the product brand name Fabric, interface names IFabricExtensionManagerInternal, IArtifactManagerInternal, and the enum CoreTelemetryEventNames.
Return only JSON. No prose.
      `;
    }, { label: `scan:${file.filename}` });

    let jsonText = res?.fences?.[0]?.content ?? res?.text ?? "";
    jsonText = typeof jsonText === "string" ? jsonText.trim() : "";

    if (!jsonText) throw new Error("Model response was empty.");

    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected a JSON array from the model response.");
    }

    findings = parsed;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    findings = [
      {
        severity: "SYSTEMERROR",
        message: `Failed to produce valid JSON: ${err.message}`,
        line: 0,
        snippet: "",
      },
    ];
  }

  aggregated.results[file.filename] = findings;

  if (findings.length) {
    aggregated.summary.filesWithFindings += 1;
  }

  for (const finding of findings) {
    const severity =
      typeof finding?.severity === "string" && finding.severity
        ? finding.severity.toUpperCase()
        : "UNKNOWN";
    aggregated.summary.severityCounts[severity] =
      (aggregated.summary.severityCounts[severity] ?? 0) + 1;
  }
}

output.fence(JSON.stringify(aggregated, null, 2));

const severityEntries = Object.entries(aggregated.summary.severityCounts);
const severitySummary = severityEntries
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([severity, count]) => `${severity}: ${count}`)
  .join(", ");

console.log(
  `Sensitive scan complete for ${directory}. Files scanned: ${aggregated.summary.filesScanned}, files with findings: ${aggregated.summary.filesWithFindings}.`,
);
console.log(
  severityEntries.length
    ? `Severity counts -> ${severitySummary}`
    : "Severity counts -> none",
);
