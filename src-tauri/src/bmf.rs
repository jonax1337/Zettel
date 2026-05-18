// BMF-Lohnsteuer-Rechner-Schnittstelle.
//
// Das BMF stellt unter `bmf-steuerrechner.de/interface/<JAHR>Version1.xhtml`
// einen XML-Service zur Verfügung. Für LZZ=1 (Lohnzahlungszeitraum Jahr)
// und Steuerklasse 1 (ledig) bzw. 3 (verheiratet/Splittingtarif) liefert
// LSTLZZ exakt die tarifliche Jahres-Einkommensteuer nach § 32a EStG.
//
// Wir reichen das durch und lassen den Anrufer (TS-Seite) auf den lokalen
// Tarif zurückfallen, falls offline oder API-Fehler. KiSt rechnen wir
// weiterhin lokal — wir senden R=0 an BMF, damit SOLZ-Berechnung ohne KiSt-
// Komplikation läuft.

use std::time::Duration;

#[derive(serde::Serialize)]
pub struct BmfTaxResult {
    /// Jahres-Einkommensteuer in Cent (LSTLZZ aus BMF-Response bei LZZ=1).
    pub est: u64,
    /// Solidaritätszuschlag in Cent (SOLZLZZ).
    pub soli: u64,
    /// Veranlagungsjahr, das tatsächlich gerechnet wurde.
    pub year: u16,
}

#[tauri::command]
pub fn fetch_bmf_income_tax(
    zv_e_cent: u64,
    status: String,
    year: u16,
) -> Result<BmfTaxResult, String> {
    let stkl = match status.as_str() {
        "married" => 3,
        _ => 1,
    };

    let url = format!(
        "https://www.bmf-steuerrechner.de/interface/{}Version1.xhtml",
        year
    );

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();

    let zv_e_str = zv_e_cent.to_string();
    let year_str = year.to_string();
    let stkl_str = stkl.to_string();

    // Pflichtparameter laut BMF-Schnittstellen-Doku. Alles, was wir nicht
    // brauchen, geht als 0 raus — der Service fordert sie trotzdem.
    let params: &[(&str, &str)] = &[
        ("code", "ext2024"),
        ("LZZ", "1"),
        ("STKL", &stkl_str),
        ("VJAHR", &year_str),
        ("AJAHR", &year_str),
        ("RE4", &zv_e_str),
        ("LZZFREIB", "0"),
        ("LZZHINZU", "0"),
        ("PVS", "0"),
        ("PVZ", "0"),
        ("R", "0"),
        ("VBEZ", "0"),
        ("VBS", "0"),
        ("VBEZM", "0"),
        ("VBEZS", "0"),
        ("VKAPA", "0"),
        ("VMT", "0"),
        ("ZKF", "0"),
        ("ZMVB", "0"),
        ("JFREIB", "0"),
        ("JHINZU", "0"),
        ("JRE4", "0"),
        ("JRE4ENT", "0"),
        ("JVBEZ", "0"),
        ("PKV", "0"),
        ("KVZ", "0"),
        ("KRV", "0"),
        ("ALTER1", "0"),
        ("ENTSCH", "0"),
        ("F", "1.0"),
        ("MBV", "0"),
        ("SONSTB", "0"),
        ("SONSTENT", "0"),
        ("STERBE", "0"),
        ("VKAPAS", "0"),
    ];

    let mut req = agent.get(&url);
    for (k, v) in params {
        req = req.query(k, v);
    }

    let body = req
        .call()
        .map_err(|e| format!("BMF nicht erreichbar: {e}"))?
        .into_string()
        .map_err(|e| format!("BMF-Antwort unlesbar: {e}"))?;

    let lst = extract_value(&body, "LSTLZZ")
        .ok_or_else(|| "LSTLZZ in BMF-Antwort nicht gefunden".to_string())?
        .parse::<u64>()
        .map_err(|e| format!("LSTLZZ parse: {e}"))?;

    // SOLZLZZ kann bei niedrigem Einkommen unter Soli-Freigrenze fehlen oder
    // 0 sein — beides ist OK.
    let soli = extract_value(&body, "SOLZLZZ")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(BmfTaxResult {
        est: lst,
        soli,
        year,
    })
}

fn extract_value(body: &str, attr_name: &str) -> Option<String> {
    // Sucht ein `<ausgabe name="<attr>" ... value="<val>" .../>`-Element.
    // Reihenfolge der Attribute kann variieren — wir nehmen das nächste
    // `value="..."` nach dem Match auf `name="<attr>"`.
    let needle = format!("name=\"{}\"", attr_name);
    let start = body.find(&needle)?;
    let after = &body[start..];
    let value_marker = after.find("value=\"")?;
    let after_value = &after[value_marker + 7..];
    let end = after_value.find('"')?;
    Some(after_value[..end].to_string())
}
