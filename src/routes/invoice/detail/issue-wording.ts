import { isDraftNumber } from "$lib/utils/invoice-number";

type Subject = { number: string; isCreditNote: boolean };

/** What happens to the PDF while the document is issued. */
export type IssuePurpose = "pdf" | "mail" | "mark";

/** A never-numbered draft gets its number when issued; a reopened one keeps the number it already has. */
export function hasOwnNumber(subject: Pick<Subject, "number">): boolean {
  return !isDraftNumber(subject.number);
}

export function issueActionLabel(subject: Pick<Subject, "isCreditNote">): string {
  return subject.isCreditNote ? "Stornorechnung ausstellen" : "Rechnung ausstellen";
}

function whatIssuingDoes(subject: Subject): string {
  const word = subject.isCreditNote ? "Stornorechnung" : "Rechnung";
  const numbering = hasOwnNumber(subject)
    ? `behält die Nummer ${subject.number}, gilt wieder als versendet und wird erneut versiegelt`
    : "bekommt ihre Nummer, gilt als versendet und wird versiegelt";
  return `Die ${word} ${numbering}.`;
}

/** Final means: number and seal are fixed. What can still be done afterwards is spelled out, not hidden. */
function whatStaysPossible(subject: Pick<Subject, "isCreditNote">): string {
  return subject.isCreditNote
    ? "Eine Stornorechnung wird nicht durch eine weitere korrigiert; solange noch nichts darauf gebucht ist, kannst du sie über „Zurück zu Entwurf“ wieder öffnen. Die ursprüngliche Rechnung wird um diesen Betrag gemindert."
    : "Korrigieren kannst du sie später per Stornorechnung; solange noch nichts darauf gebucht ist, auch über „Zurück zu Entwurf“.";
}

const PDF_SENTENCE: Record<IssuePurpose, string> = {
  pdf: "Danach wird die PDF erzeugt.",
  mail: "Danach wird die PDF erzeugt und dein Mail-Programm öffnet sich.",
  mark: "Die PDF wird dabei nicht erzeugt.",
};

export function issueDialogDescription(subject: Subject, purpose: IssuePurpose): string {
  return [whatIssuingDoes(subject), PDF_SENTENCE[purpose], whatStaysPossible(subject)].join(" ");
}

/** The hint panel shown next to a draft. */
export function issuePanelText(subject: Subject): string {
  const word = subject.isCreditNote ? "diese Stornorechnung" : "diese Rechnung";
  const intro = hasOwnNumber(subject)
    ? `Beim Ausstellen behält ${word} die Nummer ${subject.number} und wird erneut versiegelt.`
    : `Beim Ausstellen bekommt ${word} ihre Nummer und wird versiegelt.`;
  return `${intro} ${whatStaysPossible(subject)}`;
}
