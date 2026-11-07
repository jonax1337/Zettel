// Zettel document template for invoices, offers and reminders.
//
// Renders the view built by sidecar/invoice/document_view.py, passed as JSON
// in `sys.inputs.data`. Every text and amount arrives final (translated,
// formatted, decided); this file only decides how it looks. Colors and sizes
// follow templates/invoice.css so both PDF engines share one look per theme.
//
// One sober business layout in the style of German invoicing tools (DIN 5008
// form B, logo top right, information block beside the address, gray table
// head, totals flush right). The themes only vary color and rules.

#let d = json(bytes(sys.inputs.data))

#let sans = ("Helvetica", "Arial", "Liberation Sans", "DejaVu Sans")
#let mono = ("Courier New", "Liberation Mono", "DejaVu Sans Mono")

#let classic = (
  text: rgb("#222222"),
  muted: rgb("#6b6b6b"),
  faint: rgb("#9a9a9a"),
  accent: rgb("#222222"),
  brand: rgb("#222222"),
  head-fill: rgb("#efefef"),
  head-text: rgb("#222222"),
  head-rule: none,
  row-rule: 0.3pt + rgb("#e2e2e2"),
  last-row-rule: 0.6pt + rgb("#222222"),
  grand-rule: 0.6pt + rgb("#222222"),
  grand-text: rgb("#222222"),
  footer-rule: 0.4pt + rgb("#cfcfcf"),
  soft-fill: rgb("#f5f5f5"),
  callout-bar: 0.8mm + rgb("#9a9a9a"),
)

#let themes = (
  classic: classic,
  modern: classic + (
    text: rgb("#1f2933"),
    muted: rgb("#5f6b78"),
    faint: rgb("#8d97a3"),
    accent: rgb("#0b5d6b"),
    brand: rgb("#0b5d6b"),
    head-fill: rgb("#e2eef0"),
    head-text: rgb("#0b5d6b"),
    row-rule: 0.3pt + rgb("#dbe7ea"),
    last-row-rule: 0.8pt + rgb("#0b5d6b"),
    grand-rule: 0.8pt + rgb("#0b5d6b"),
    grand-text: rgb("#0b5d6b"),
    footer-rule: 0.8pt + rgb("#0b5d6b"),
    soft-fill: rgb("#eef6f7"),
    callout-bar: 0.8mm + rgb("#0b5d6b"),
  ),
  minimal: classic + (
    text: rgb("#111111"),
    muted: rgb("#7a7a7a"),
    faint: rgb("#a8a8a8"),
    head-fill: none,
    head-text: rgb("#7a7a7a"),
    head-rule: 0.4pt + rgb("#111111"),
    row-rule: none,
    last-row-rule: 0.4pt + rgb("#111111"),
    grand-rule: 0.4pt + rgb("#111111"),
    footer-rule: 0.3pt + rgb("#dddddd"),
    soft-fill: none,
    callout-bar: 0.3pt + rgb("#111111"),
  ),
)

#let th = themes.at(d.theme, default: classic)
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
#let letterhead-top = 12mm
#let logo-height = 18mm
#let address-field = (x: 20mm, y: 45mm, width: 85mm, height: 45mm)
#let address-note-height = 17.7mm
#let address-indent = 5mm
// Level with the sender line above the address. 65 mm (the norm allows 75)
// ends the block flush with the text area.
#let info-block = (x: 125mm, y: 59mm, width: 65mm)
#let subject-top = 98.5mm
#let subject-gap = 8mm
#let fold-marks = ((y: 105mm, length: 4mm), (y: 148.5mm, length: 6mm), (y: 210mm, length: 4mm))
#let fold-mark-x = 3mm
#let fold-mark-stroke = 0.3pt + luma(185)

#let at-sheet(x, y, width, body) = place(
  top + left, dx: x - margin-left, dy: y - margin-top, block(width: width, body),
)

// ----- building blocks -----------------------------------------------------

#let block-title(body) = block(below: 1.5mm, text(size: 9.5pt, weight: "bold", body))

// Label/value tables: padding instead of a column gutter keeps row rules unbroken.
#let label-inset(x, y) = (left: 0pt, right: if x == 0 { 4mm } else { 0pt }, y: 1.3mm)

#let callout(body) = block(
  width: 100%,
  above: 6mm,
  below: 6mm,
  inset: (x: 4mm, y: 3mm),
  fill: th.soft-fill,
  stroke: (left: th.callout-bar),
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
    block(below: 1mm, text(weight: "bold", fill: th.text, column.title))
  }
  column.lines.map(footer-line).join(linebreak())
}

#let page-footer() = align(bottom, pad(bottom: footer-clearance, {
  set text(size: 7.5pt, fill: th.muted)
  set par(leading: 0.45em)
  block(width: 100%, stroke: (top: th.footer-rule), inset: (top: 3mm), grid(
    // The bank column is wider: a 22-character IBAN in groups stays on one line.
    columns: d.footer.map(column => if column.wide { 1.4fr } else { 1fr }),
    column-gutter: 6mm,
    ..d.footer.map(footer-column),
  ))
  v(2mm, weak: true)
  align(right, text(size: 8pt, fill: page-count-color, page-label()))
}))

// Logo, or the company name where there is none, top right.
#let letterhead() = at-sheet(margin-left, letterhead-top, text-width, align(right, {
  if d.logo != none {
    image(d.logo, height: logo-height)
  } else {
    text(size: 16pt, weight: "bold", fill: th.brand, d.company.name)
    if d.company.owner != none { block(above: 1.5mm, text(size: 9pt, fill: th.muted, d.company.owner)) }
  }
}))

#let address-window() = at-sheet(address-field.x, address-field.y, address-field.width, {
  set par(leading: 0.45em)
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
  block(width: 100%, inset: (left: address-indent, top: 1mm), {
    d.recipient.name
    for line in d.recipient.lines {
      linebreak()
      line
    }
  })
})

#let meta-table() = {
  set text(size: 9pt)
  table(
    columns: (auto, 1fr),
    inset: label-inset,
    stroke: none,
    align: (left, right),
    ..d.meta.map(row => (text(fill: th.muted, row.label), row.value)).flatten(),
  )
}

#let meta-box() = at-sheet(info-block.x, info-block.y, info-block.width, meta-table())

// The subject sits at the norm position unless a long information block reaches past it.
#let subject-line() = context {
  let meta-bottom = info-block.y + measure(block(width: info-block.width, meta-table())).height
  v(calc.max(subject-top, meta-bottom + subject-gap) - margin-top)
  block(below: 6mm, text(size: 14pt, weight: "bold", fill: th.accent, d.title + " " + d.number))
}

#let fold-mark-layer() = for mark in fold-marks {
  place(top + left, dx: fold-mark-x, dy: mark.y, line(length: mark.length, stroke: fold-mark-stroke))
}

#let continuation-header() = context {
  if counter(page).get().first() > 1 {
    set text(size: 8pt, fill: th.muted)
    block(
      width: 100%,
      inset: (bottom: 1.5mm),
      stroke: (bottom: th.footer-rule),
      grid(columns: (1fr, auto), d.company.name, d.title + " " + d.number),
    )
  }
}

#let description-cell(row) = {
  row.description
  if row.at("detail", default: none) != none {
    block(above: 1mm, text(size: 0.88em, fill: th.muted, row.detail))
  }
  if row.at("period", default: none) != none {
    block(above: 1mm, text(size: 0.85em, fill: th.muted, style: "italic", row.period))
  }
}

#let table-cell(column, row) = {
  let value = row.at(column.key)
  if column.key == "description" {
    description-cell(row)
  } else if column.at("muted", default: false) {
    text(fill: th.faint, value)
  } else if column.at("strong", default: false) {
    text(weight: "bold", value)
  } else {
    value
  }
}

#let row-stroke(y, row-count) = {
  if y == 0 { (bottom: th.head-rule) } else if y == row-count { (bottom: th.last-row-rule) } else { (bottom: th.row-rule) }
}

// A filled table head needs room at both ends; a ruled one aligns with the text
// edge. Totals keep the same right edge so the amounts line up.
#let table-edge = if th.head-fill == none { 0pt } else { 2mm }

#let items-table(spec) = {
  if spec.title != none {
    block(above: 6mm, below: 3mm, text(size: 11pt, weight: "bold", spec.title))
  }
  let columns = spec.columns
  let edge = table-edge
  table(
    columns: columns.map(c => if c.key in ("description", "document") { 1fr } else { auto }),
    inset: (x, y) => (
      left: if x == 0 { edge } else { 2.5mm },
      right: if x == columns.len() - 1 { edge } else { 2.5mm },
      y: if y == 0 { 2mm } else { 2.4mm },
    ),
    fill: (x, y) => if y == 0 { th.head-fill },
    stroke: (x, y) => row-stroke(y, spec.rows.len()),
    align: (x, y) => (if columns.at(x).align == "right" { right } else { left }) + top,
    table.header(..columns.map(c => text(size: 9pt, weight: "bold", fill: th.head-text, c.label))),
    ..spec.rows.map(row => columns.map(c => table-cell(c, row))).flatten(),
  )
}

#let total-cells(row) = {
  if row.kind == "grand" {
    let grand(body) = text(size: 11pt, weight: "bold", fill: th.grand-text, body)
    (grand(row.label), grand(row.value))
  } else {
    let style = if row.kind == "paid" { "italic" } else { "normal" }
    let value-color = if row.kind == "paid" { th.muted } else { th.text }
    (text(fill: th.muted, style: style, row.label), text(fill: value-color, style: style, row.value))
  }
}

#let totals() = align(right, block(width: 85mm, above: 5mm, below: 10mm, table(
  columns: (1fr, auto),
  inset: (x, y) => (
    label-inset(x, y)
      + (right: if x == 1 { table-edge } else { 4mm })
      + if d.totals.at(y).kind == "grand" { (y: 2.2mm) } else { (:) }
  ),
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
        stroke: (left: 0.5mm + th.accent),
        text(size: 9pt, payment.skonto),
      )
    }
  }
  if payment.qr == none {
    block(above: 6mm, text-part)
  } else {
    block(above: 6mm, grid(
      columns: (1fr, 32mm),
      column-gutter: 8mm,
      text-part,
      align(center, {
        image(bytes(payment.qr.svg), format: "svg", width: 24mm)
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
// Tabular figures keep amounts aligned digit by digit.
#set text(font: sans, size: 10pt, fill: th.text, lang: d.lang, number-width: "tabular")
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
#subject-line()

#for note in d.topCallouts { callout(note) }

#for paragraph in d.intro { block(below: 4mm, paragraph) }

#items-table(d.table)
#totals()

#for note in d.callouts { callout(note) }

#if d.payment != none { payment-block(d.payment) }

#for item in d.blocks { content-block(item) }
