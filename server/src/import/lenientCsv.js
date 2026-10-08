// Tolerant CSV reader, used only when the standard reader rejects a file because of quotes.
// CXone can export free-text fields with quotation marks that aren't escaped the standard way, e.g.
//   1,"Customer said "cancel" now",3
// Rule: inside a quoted field, "" is a literal quote, and a single " only ends the field when it is
// followed by a comma, a line break or the end of the file - any other " is kept as text.
// A line break always ends the row here. (What it can still misread: a stray quote immediately followed
// by a comma, or a genuine line break inside a field - such rows then fail validation and are reported.)
export function parseCsvLenient(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // skip a byte-order mark
  const n = text.length;

  const endField = () => {
    row.push(field.trim());
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '\n' || ch === '\r') {
        // A line break always ends the row in tolerant mode, so one badly quoted field can't swallow
        // the rest of the file (report 540 rows are one line each).
        inQuotes = false;
        continue; // handled as a normal line break below
      }
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        if (next === undefined || next === ',' || next === '\n' || next === '\r') {
          inQuotes = false;
        } else {
          field += '"'; // stray quote inside the text: keep it
        }
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}
