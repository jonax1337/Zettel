use std::time::Duration;

const ECB_URL: &str = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

/// Async so the blocking HTTP request does not run on the main thread, which
/// would freeze the window for up to `REQUEST_TIMEOUT`.
#[tauri::command]
pub async fn fetch_ecb_exchange_rate(currency: String) -> Result<String, String> {
    let target = currency.to_uppercase();
    if target == "EUR" {
        return Ok("1".to_string());
    }

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(REQUEST_TIMEOUT))
        .build()
        .into();
    let body = agent
        .get(ECB_URL)
        .call()
        .map_err(|e| format!("EZB nicht erreichbar: {e}"))?
        .into_body()
        .read_to_string()
        .map_err(|e| format!("EZB-Antwort unlesbar: {e}"))?;

    parse_rate(&body, &target)
}

/// Reads the `rate` attribute of the `<Cube currency='XXX' rate='…'/>` element
/// for `currency` from the ECB daily reference-rate XML.
fn parse_rate(body: &str, currency: &str) -> Result<String, String> {
    let cube_start = [
        format!("currency='{currency}'"),
        format!("currency=\"{currency}\""),
    ]
    .iter()
    .find_map(|needle| body.find(needle))
    .ok_or_else(|| format!("Währung {currency} nicht in EZB-Tageskurs gelistet."))?;

    let tag = &body[cube_start..];
    let tag = &tag[..tag.find('>').unwrap_or(tag.len())];
    let rate_attr = &tag[tag.find("rate=").ok_or("rate-Attribut fehlt")? + "rate=".len()..];
    let quote = rate_attr
        .chars()
        .next()
        .filter(|c| matches!(c, '\'' | '"'))
        .ok_or("ungültiges rate-Attribut")?;
    let value = &rate_attr[1..];
    let end = value.find(quote).ok_or("rate-Attribut nicht terminiert")?;
    Ok(value[..end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ECB_XML: &str = "<gesmes:Envelope><Cube><Cube time='2026-11-03'>\
        <Cube currency='USD' rate='1.0856'/>\
        <Cube currency='JPY' rate=\"163.2\"/>\
        <Cube currency='CHF'/>\
        </Cube></Cube></gesmes:Envelope>";

    #[test]
    fn reads_rate_with_single_and_double_quotes() {
        assert_eq!(parse_rate(ECB_XML, "USD").unwrap(), "1.0856");
        assert_eq!(parse_rate(ECB_XML, "JPY").unwrap(), "163.2");
    }

    #[test]
    fn unknown_currency_is_reported() {
        let err = parse_rate(ECB_XML, "XYZ").unwrap_err();
        assert!(err.contains("XYZ"), "{err}");
    }

    #[test]
    fn missing_rate_does_not_borrow_the_next_elements_rate() {
        assert_eq!(
            parse_rate(ECB_XML, "CHF").unwrap_err(),
            "rate-Attribut fehlt"
        );
    }

    #[test]
    fn unterminated_rate_is_reported() {
        let xml = "<Cube currency='USD' rate='1.08/>";
        assert!(parse_rate(xml, "USD").is_err());
    }

    #[test]
    fn eur_needs_no_request() {
        let rate = tauri::async_runtime::block_on(fetch_ecb_exchange_rate("eur".into()));
        assert_eq!(rate.unwrap(), "1");
    }
}
