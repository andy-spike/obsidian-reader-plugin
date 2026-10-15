// Original, deterministic two-page text PDF for the disposable development vault.
export function samplePdf({ outline = false } = {}) {
  const pages = [
    ["Sample reading book", "Chapter 1: Questions in the margin", "A reader pauses at a passage and writes a question.", "The question connects an argument to the reader's life.", "Select this passage, highlight it, and add a comment."],
    ["Chapter 2: Returning to the evidence", "Good notes preserve the passage and its location.", "A citation should bring the reader back to the evidence.", "Annotations help us revisit an idea with fresh questions."],
  ];
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < pages.length; i++) {
    const stream = `BT /F1 18 Tf 60 730 Td (${pages[i][0]}) Tj /F1 12 Tf ` + pages[i].slice(1).map(line => `0 -36 Td (${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ") + " ET";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  if (outline) {
    objects[0] = "<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>";
    objects.push(
      "<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>",
      "<< /Title (Questions in the margin) /Parent 8 0 R /Next 10 0 R /Dest [4 0 R /Fit] >>",
      "<< /Title (Returning to the evidence) /Parent 8 0 R /Prev 9 0 R /Dest [6 0 R /Fit] >>",
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
