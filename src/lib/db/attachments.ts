import { execute, select } from "./client";
import type { InvoiceAttachment } from "./schema";

type InvoiceAttachmentRow = {
  id: number;
  invoice_id: number;
  filename: string;
  content_hash: string;
  mime_type: string;
  file_size: number;
  created_at: number;
};

function mapAttachment(r: InvoiceAttachmentRow): InvoiceAttachment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    filename: r.filename,
    contentHash: r.content_hash,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    createdAt: r.created_at,
  };
}

export type AttachmentInput = {
  invoiceId: number;
  filename: string;
  contentHash: string;
  mimeType: string;
  fileSize: number;
};

export async function listAttachments(
  invoiceId: number,
): Promise<InvoiceAttachment[]> {
  const rows = await select<InvoiceAttachmentRow>(
    "SELECT * FROM invoice_attachments WHERE invoice_id = ? ORDER BY created_at ASC, id ASC",
    [invoiceId],
  );
  return rows.map(mapAttachment);
}

export async function getAttachment(
  id: number,
): Promise<InvoiceAttachment | null> {
  const rows = await select<InvoiceAttachmentRow>(
    "SELECT * FROM invoice_attachments WHERE id = ?",
    [id],
  );
  return rows.length ? mapAttachment(rows[0]) : null;
}

export async function addAttachment(input: AttachmentInput): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const res = await execute(
    `INSERT INTO invoice_attachments
      (invoice_id, filename, content_hash, mime_type, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.invoiceId,
      input.filename,
      input.contentHash,
      input.mimeType,
      input.fileSize,
      now,
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function removeAttachment(id: number): Promise<void> {
  await execute("DELETE FROM invoice_attachments WHERE id = ?", [id]);
}
