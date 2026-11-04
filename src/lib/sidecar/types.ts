import type { ValidationReport } from "$lib/validator";

export type SidecarErrorInfo = { code: string; message: string; details: string };

export type SidecarSuccess = {
  success: true;
  pdfPath: string;
  validationWarnings: string[];
  validationErrors: string[];
  /** KoSIT report. null = validator unavailable (Java/jar missing). */
  kositReport?: ValidationReport | null;
};

export type SidecarError = {
  success: false;
  error: SidecarErrorInfo;
};

export type SidecarResponse = SidecarSuccess | SidecarError;
