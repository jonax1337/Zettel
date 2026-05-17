import { invoke } from "@tauri-apps/api/core";

export type ValidationFinding = {
  severity: "error" | "warning" | "info" | string;
  code: string | null;
  message: string;
  location: string | null;
};

export type ValidationReport = {
  valid: boolean;
  scenario: string | null;
  findings: ValidationFinding[];
  rawReportPath: string;
};

export type ValidatorStatus = {
  installed: boolean;
  validatorDir: string;
  hasJava: boolean;
  javaVersion: string | null;
};

type RustReport = {
  valid: boolean;
  scenario: string | null;
  findings: ValidationFinding[];
  raw_report_path: string;
};

type RustStatus = {
  installed: boolean;
  validator_dir: string;
  has_java: boolean;
  java_version: string | null;
};

function mapReport(r: RustReport): ValidationReport {
  return {
    valid: r.valid,
    scenario: r.scenario,
    findings: r.findings ?? [],
    rawReportPath: r.raw_report_path,
  };
}

export async function getValidatorStatus(): Promise<ValidatorStatus> {
  const r = await invoke<RustStatus>("validator_status");
  return {
    installed: r.installed,
    validatorDir: r.validator_dir,
    hasJava: r.has_java,
    javaVersion: r.java_version,
  };
}

export async function validatePdf(pdfPath: string): Promise<ValidationReport> {
  const r = await invoke<RustReport>("validate_einvoice_pdf", { pdfPath });
  return mapReport(r);
}

export async function validateXml(xmlPath: string): Promise<ValidationReport> {
  const r = await invoke<RustReport>("validate_einvoice_xml", { xmlPath });
  return mapReport(r);
}
