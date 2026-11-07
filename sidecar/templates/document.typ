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
  brand-size: 14pt,
  brand-weight: "bold",
  brand-tracking: 0.2pt,
  brand-fill: rgb("#1f2933"),
  brand-align: left,
  subject-weight: "bold",
  subject-fill: rgb("#1f2933"),
  meta-fill: none,
  meta-top-rule: 0.6pt + rgb("#1f2933"),
  meta-bar: none,
  meta-row-rule: 0.2pt + rgb("#e6e9ec"),
  grand-rule: 0.6pt + rgb("#1f2933"),
  thead-rule: 0.6pt + rgb("#1f2933"),
  last-row-rule: 0.4pt + rgb("#1f2933"),
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
    brand-size: 15pt,
    brand-tracking: 0pt,
    brand-fill: rgb("#0f4c75"),
    brand-align: right,
    subject-fill: rgb("#0f4c75"),
    meta-fill: rgb("#eef4f8"),
    meta-top-rule: none,
    meta-bar: 1mm + rgb("#3282b8"),
    meta-row-rule: 0.2pt + rgb("#cfe0eb"),
    grand-rule: 1.2pt + rgb("#0f4c75"),
    thead-rule: 1pt + rgb("#0f4c75"),
    last-row-rule: 0.6pt + rgb("#0f4c75"),
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
    brand-size: 13pt,
    brand-weight: "medium",
    brand-tracking: 0pt,
    brand-fill: rgb("#111111"),
    subject-weight: "semibold",
    subject-fill: rgb("#111111"),
    meta-top-rule: none,
    meta-row-rule: 0.2pt + rgb("#eeeeee"),
    grand-rule: 0.3pt + rgb("#111111"),
    thead-rule: 0.3pt + rgb("#111111"),
    last-row-rule: 0.3pt + rgb("#111111"),
    callout-fill: none,
    callout-bar: 0.3pt + rgb("#eeeeee"),
    callout-radius: 0pt,
  ),
)

#let th = themes.at(d.theme, default: classic)
#let sans = ("Helvetica", "Arial", "Liberation Sans", "DejaVu Sans")
#let mono = ("Courier New", "Liberation Mono", "DejaVu Sans Mono")
#let page-count-color = rgb("#9a9a9a")

// DIN 5008 form B, measured from the sheet edge. The text area starts at
// the left margin; page-one elements outside it are placed with `at-sheet`.
#let page-width = 210mm
#let margin-left = 25mm
#let margin-right = 20mm
#let margin-top = 20mm
#let margin-bottom = 38mm
#let footer-clearance = 8mm
#let text-width = page-width - margin-left - margin-right
#let letterhead-top = 10mm
#let address-field = (x: 20mm, y: 45mm, width: 85mm, height: 45mm)
#let address-note-height = 17.7mm
#let address-indent = 5mm
#let info-block = (x: 125mm, y: 50mm, width: 75mm)
#let subject-top = 98.5mm
#let fold-marks = ((y: 105mm, length: 5mm), (y: 148.5mm, length: 7mm), (y: 210mm, length: 5mm))
#let fold-mark-x = 2mm
#let fold-mark-stroke = 0.3pt + luma(150)

#let at-sheet(x, y, width, body) = place(
  top + left, dx: x - margin-left, dy: y - margin-top, block(width: width, body),
)

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

#let page-footer() = align(bottom, pad(bottom: footer-clearance, {
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
}))

#let letterhead() = {
  let align-brand(body) = align(th.brand-align, body)
  let parts = ()
  if d.logo != none { parts.push(align-brand(image(d.logo, height: 16mm))) }
  parts.push(align-brand(text(
    size: th.brand-size, weight: th.brand-weight, tracking: th.brand-tracking, fill: th.brand-fill, d.company.name,
  )))
  if d.company.owner != none { parts.push(align-brand(text(size: 9pt, fill: th.muted, d.company.owner))) }
  at-sheet(margin-left, letterhead-top, text-width, stack(spacing: 2.5mm, ..parts))
}

#let address-window() = at-sheet(address-field.x, address-field.y, address-field.width, {
  set par(leading: 0.4em)
  block(
    width: 100%,
    height: address-note-height,
    inset: (left: address-indent),
    align(bottom, block(
      width: 100%,
      inset: (bottom: 0.8mm),
      stroke: (bottom: 0.3pt + th.faint),
      text(size: 7pt, fill: th.muted, d.senderLine),
    )),
  )
  block(width: 100%, inset: (left: address-indent), {
    text(weight: "semibold", d.recipient.name)
    for line in d.recipient.lines {
      linebreak()
      line
    }
  })
})

#let meta-box() = at-sheet(info-block.x, info-block.y, info-block.width, block(
  width: 100%,
  inset: if th.meta-fill == none { 0pt } else { (x: 3mm, y: 1.5mm) },
  fill: th.meta-fill,
  stroke: (top: th.meta-top-rule, left: th.meta-bar),
  {
    set text(size: 9pt)
    table(
      columns: (auto, 1fr),
      inset: label-inset,
      stroke: (x, y) => (top: if y > 0 { th.meta-row-rule } else { none }),
      align: left,
      ..d.meta.map(row => (text(fill: th.muted, row.label), text(weight: "medium", row.value))).flatten(),
    )
  },
))

#let subject-line() = block(
  below: 6mm,
  text(size: 11pt, weight: th.subject-weight, fill: th.subject-fill, d.title + " " + d.number),
)

#let fold-mark-layer() = for mark in fold-marks {
  place(top + left, dx: fold-mark-x, dy: mark.y, line(length: mark.length, stroke: fold-mark-stroke))
}

#let continuation-header() = context {
  if counter(page).get().first() > 1 {
    set text(size: 8pt, fill: th.muted)
    block(
      width: 100%,
      inset: (bottom: 1.5mm),
      stroke: (bottom: 0.3pt + th.rule-soft),
      grid(columns: (1fr, auto), d.company.name, d.title + " " + d.number),
    )
  }
}

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
    block(above: 6mm, below: 3mm, text(size: 11pt, weight: "bold", spec.title))
  }
  let columns = spec.columns
  table(
    columns: columns.map(c => if c.key in ("description", "document") { 1fr } else { auto }),
    inset: (x, y) => (
      left: if x == 0 { 0pt } else { 2.5mm },
      right: if x == columns.len() - 1 { 0pt } else { 2.5mm },
      y: 2.4mm,
    ),
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
  margin: (left: margin-left, right: margin-right, top: margin-top, bottom: margin-bottom),
  header: continuation-header(),
  header-ascent: 6mm,
  footer: page-footer(),
  footer-descent: 0pt,
  background: fold-mark-layer(),
)

#letterhead()
#address-window()
#meta-box()
#v(subject-top - margin-top)
#subject-line()

#for note in d.topCallouts { callout(note) }

#for paragraph in d.intro { block(below: 4mm, paragraph) }

#items-table(d.table)
#totals()

#for note in d.callouts { callout(note) }

#if d.payment != none { payment-block(d.payment) }

#for item in d.blocks { content-block(item) }
