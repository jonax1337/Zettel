export type MailDraft = {
  to: string;
  subject: string;
  body: string;
};

/** Line breaks in a mailto body are CRLF (RFC 6068); everything else is percent-encoded as UTF-8. */
function encodeValue(text: string): string {
  return encodeURIComponent(text.replace(/\r?\n/g, "\r\n"));
}

/** The recipient keeps its `@`, which readers of the URL expect to see unescaped. */
function encodeRecipient(address: string): string {
  return encodeURIComponent(address.trim()).replace(/%40/g, "@");
}

export function buildMailtoUrl({ to, subject, body }: MailDraft): string {
  return `mailto:${encodeRecipient(to)}?subject=${encodeValue(subject)}&body=${encodeValue(body)}`;
}
