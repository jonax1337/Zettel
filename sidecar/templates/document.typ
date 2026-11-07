// Zettel document template for invoices, offers and reminders.
//
// Renders the view built by sidecar/invoice/document_view.py, passed as JSON
// in `sys.inputs.data`. Every text and amount arrives final (translated,
// formatted, decided); this file only decides how it looks. Colors and sizes
// follow templates/invoice.css so both PDF engines share one look per theme.

#let d = json(bytes(sys.inputs.data))

#let classic = (
  text: rgb("#1f2933"),
  muted: rgb("#66707b"),
  faint: rgb("#8a929c"),
  rule: rgb("#1f2933"),
  rule-soft: rgb("#e6e9ec"),
  rule-row: rgb("#eaedf0"),
  soft-fill: rgb("#f7f8f9"),
  accent: rgb("#1f2933"),
  accent-soft: rgb("#66707b"),
  doctype-size: 22pt,
  doctype-weight: "light",
  doctype-tracking: 1.5pt,
  doctype-upper: true,
  brand-size: 13pt,
  brand-weight: "bold",
  brand-tracking: 0.2pt,
  masthead-rule: 0.6pt + rgb("#1f2933"),
  grand-rule: 0.6pt + rgb("#1f2933"),
  thead-rule: 0.6pt + rgb("#1f2933"),
  last-row-rule: 0.4pt + rgb("#1f2933"),
  meta-fill: rgb("#f7f8f9"),
  meta-stroke: 0.3pt + rgb("#e6e9ec"),
  meta-radius: 1.5mm,
  callout-fill: rgb("#f7f8f9"),
  callout-bar: 1mm + rgb("#66707b"),
  callout-radius: (right: 1.5mm),
)

#let themes = (
  classic: classic,
  modern: classic + (
    accent: rgb("#0f4c75"),
    accent-soft: rgb("#3282b8"),
    rule: rgb("#0f4c75"),
    soft-fill: rgb("#eef4f8"),
    rule-soft: rgb("#cfe0eb"),
    doctype-weight: "bold",
    doctype-tracking: 0.5pt,
    doctype-upper: false,
    brand-size: 14pt,
    brand-tracking: 0pt,
    masthead-rule: 1.2pt + rgb("#0f4c75"),
    grand-rule: 1.2pt + rgb("#0f4c75"),
    thead-rule: 1pt + rgb("#0f4c75"),
    last-row-rule: 0.6pt + rgb("#0f4c75"),
    meta-fill: rgb("#eef4f8"),
    meta-stroke: 0.3pt + rgb("#cfe0eb"),
    meta-radius: 2.5mm,
    callout-fill: rgb("#eef4f8"),
    callout-bar: 1mm + rgb("#3282b8"),
    callout-radius: 1.5mm,
  ),
  minimal: classic + (
    text: rgb("#111111"),
    muted: rgb("#888888"),
    faint: rgb("#aaaaaa"),
    rule: rgb("#111111"),
    rule-soft: rgb("#eeeeee"),
    rule-row: rgb("#f3f3f3"),
    soft-fill: none,
    accent: rgb("#111111"),
    accent-soft: rgb("#888888"),
    doctype-size: 18pt,
    doctype-weight: "regular",
    doctype-tracking: 0.5pt,
    doctype-upper: false,
    brand-weight: "medium",
    brand-tracking: 0pt,
    masthead-rule: 0.3pt + rgb("#111111"),
    grand-rule: 0.3pt + rgb("#111111"),
    thead-rule: 0.3pt + rgb("#111111"),
    last-row-rule: 0.3pt + rgb("#111111"),
    meta-fill: none,
    meta-stroke: none,
    meta-radius: 0pt,
    callout-fill: none,
    callout-bar: 0.3pt + rgb("#eeeeee"),
    callout-radius: 0pt,
  ),
)

#let th = themes.at(d.theme, default: classic)
#let sans = ("Helvetica", "Arial", "Liberation Sans", "DejaVu Sans")
#let mono = ("Courier New", "Liberation Mono", "DejaVu Sans Mono")
#let page-count-color = rgb("#9a9a9a")

// ----- building blocks -----------------------------------------------------

#let small-caps-title(body) = text(
  size: 8.5pt, weight: "semibold", tracking: 0.4pt, fill: th.muted, upper(body),
)

#let block-title(body) = block(below: 1.5mm, small-caps-title(body))

// Label/value tables: padding instead of a column gutter keeps row rules unbroken.
#let label-inset(x, y) = (left: 0pt, right: if x == 0 { 4mm } else { 0pt }, y: 1.6mm)

#let callout(body) = block(
  width: 100%,
  above: 6mm,
  below: 6mm,
  inset: (x: 4.5mm, y: 3.5mm),
  fill: th.callout-fill,
  stroke: (left: th.callout-bar),
  radius: th.callout-radius,
  text(size: 9.5pt, body),
)

#let page-label() = context {
  let current = str(counter(page).get().first())
  let total = str(counter(page).final().first())
  d.pageLabel.replace("{n}", current).replace("{m}", total)
}

#let footer-line(line) = if line.mono { text(font: mono, tracking: 0.2pt, line.text) } else { line.text }

#let footer-column(column) = {
  if column.title != none {
    block(below: 1mm, text(weight: "semibold", fill: th.text, tracking: 0.2pt, column.title))
  }
  column.lines.map(footer-line).join(linebreak())
}

#let page-footer() = {
  set text(size: 7.5pt, fill: th.muted)
  set par(leading: 0.45em)
  block(width: 100%, stroke: (top: 0.3pt + th.rule-soft), inset: (top: 3mm), grid(
    // The bank column is wider: a 22-character IBAN in groups stays on one line.
    columns: d.footer.map(column => if column.wide { 1.4fr } else { 1fr }),
    column-gutter: 6mm,
    ..d.footer.map(footer-column),
  ))
  v(2mm, weak: true)
  align(right, text(size: 8pt, fill: page-count-color, page-label()))
}

#let masthead() = block(
  width: 100%,
  below: 10mm,
  inset: (bottom: 6mm),
  stroke: (bottom: th.masthead-rule),
  grid(
    columns: (1fr, auto),
    align: (left + top, right + top),
    {
      if d.logo != none {
        block(below: 4mm, image(d.logo, height: 22mm))
      }
      text(size: th.brand-size, weight: th.brand-weight, tracking: th.brand-tracking, d.company.name)
      if d.company.owner != none {
        block(above: 1.5mm, text(size: 9pt, fill: th.muted, d.company.owner))
      }
    },
    {
      text(
        size: th.doctype-size,
        weight: th.doctype-weight,
        tracking: th.doctype-tracking,
        fill: th.accent,
        if th.doctype-upper { upper(d.title) } else { d.title },
      )
      block(above: 3mm, text(font: mono, size: 10pt, fill: th.muted, d.number))
    },
  ),
)

#let addressee() = {
  block(
    width: 100%,
    below: 4mm,
    inset: (bottom: 1.5mm),
    stroke: (bottom: 0.3pt + th.rule-soft),
    text(size: 7.5pt, fill: th.faint, d.senderLine),
  )
  text(weight: "semibold", d.recipient.name)
  for line in d.recipient.lines {
    linebreak()
    line
  }
}

#let meta-box() = block(
  width: 100%,
  inset: (x: 4mm, y: 2.5mm),
  fill: th.meta-fill,
  stroke: th.meta-stroke,
  radius: th.meta-radius,
  {
    set text(size: 9pt)
    table(
      columns: (auto, 1fr),
      inset: label-inset,
      stroke: (x, y) => (top: if y > 0 { 0.2pt + th.rule-soft } else { none }),
      align: (left, right),
      ..d.meta.map(row => (text(fill: th.muted, row.label), text(weight: "medium", row.value))).flatten(),
    )
  },
)

#let description-cell(row) = {
  row.description
  if row.at("detail", default: none) != none {
    block(above: 1mm, text(size: 0.88em, fill: th.faint, row.detail))
  }
  if row.at("period", default: none) != none {
    block(above: 1mm, text(size: 0.85em, fill: th.faint, style: "italic", row.period))
  }
}

#let table-cell(column, row) = {
  let value = row.at(column.key)
  if column.key == "description" {
    description-cell(row)
  } else if column.at("muted", default: false) {
    text(fill: th.faint, value)
  } else if column.at("strong", default: false) {
    text(weight: "medium", value)
  } else {
    value
  }
}

#let row-rule(y, row-count) = {
  if y == 0 { th.thead-rule } else if y == row-count { th.last-row-rule } else { 0.2pt + th.rule-row }
}

#let items-table(spec) = {
  if spec.title != none {
    block(below: 3mm, text(size: 11pt, weight: "bold", spec.title))
  }
  let columns = spec.columns
  table(
    columns: columns.map(c => if c.key in ("description", "document") { 1fr } else { auto }),
    inset: (x: 2.5mm, y: 2.5mm),
    stroke: (x, y) => (bottom: row-rule(y, spec.rows.len())),
    align: (x, y) => (if columns.at(x).align == "right" { right } else { left }) + top,
    table.header(..columns.map(c => small-caps-title(c.label))),
    ..spec.rows.map(row => columns.map(c => table-cell(c, row))).flatten(),
  )
}

#let total-cells(row) = {
  if row.kind == "grand" {
    let grand(body) = text(size: 12pt, weight: "bold", fill: th.accent, body)
    (grand(row.label), grand(row.value))
  } else {
    let style = if row.kind == "paid" { "italic" } else { "normal" }
    let value-color = if row.kind == "paid" { th.muted } else { th.text }
    (text(fill: th.muted, style: style, row.label), text(fill: value-color, style: style, row.value))
  }
}

#let totals() = align(right, block(width: 80mm, above: 6mm, below: 10mm, table(
  columns: (1fr, auto),
  inset: label-inset,
  align: (left + horizon, right + horizon),
  stroke: (x, y) => (top: if d.totals.at(y).kind == "grand" { th.grand-rule } else { none }),
  ..d.totals.map(total-cells).flatten(),
)))

#let payment-block(payment) = {
  let text-part = {
    if payment.title != none { block-title(payment.title) }
    if payment.text != none { text(size: 9.5pt, payment.text) }
    if payment.skonto != none {
      block(
        above: 1.5mm,
        width: 100%,
        inset: (x: 2mm, y: 1.5mm),
        fill: th.soft-fill,
        stroke: (left: 0.5mm + th.accent-soft),
        text(size: 9pt, payment.skonto),
      )
    }
  }
  if payment.qr == none {
    block(above: 6mm, text-part)
  } else {
    block(above: 6mm, grid(
      columns: (1fr, 36mm),
      column-gutter: 8mm,
      text-part,
      align(center, {
        image(bytes(payment.qr.svg), format: "svg", width: 28mm)
        block(above: 1.5mm, text(size: 7pt, fill: th.muted, payment.qr.caption.join(linebreak())))
      }),
    ))
  }
}

#let content-block(item) = block(above: 6mm, {
  if item.title != none { block-title(item.title) }
  text(size: 9.5pt, item.text)
})

// ----- document --------------------------------------------------------------

#set document(title: d.title + " " + d.number, author: d.company.name)
#set text(font: sans, size: 10pt, fill: th.text, lang: d.lang)
#set par(leading: 0.55em)
#set page(
  paper: "a4",
  margin: (top: 20mm, bottom: 40mm, x: 18mm),
  footer: page-footer(),
  footer-descent: 6mm,
)

#masthead()

#for note in d.topCallouts { callout(note) }

#grid(
  columns: (1fr, 75mm),
  column-gutter: 12mm,
  addressee(),
  meta-box(),
)
#v(12mm)

#for paragraph in d.intro { block(below: 4mm, paragraph) }

#items-table(d.table)
#totals()

#for note in d.callouts { callout(note) }

#if d.payment != none { payment-block(d.payment) }

#for item in d.blocks { content-block(item) }
