use std::time::Duration;

const ECB_URL: &str = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

#[tauri::command]
pub fn fetch_ecb_exchange_rate(currency: String) -> Result<String, String> {
    let target = currency.to_uppercase();
    if target == "EUR" {
        return Ok("1".to_string());
    }

    let body = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build()
        .get(ECB_URL)
        .call()
        .map_err(|e| format!("EZB nicht erreichbar: {e}"))?
        .into_string()
        .map_err(|e| format!("EZB-Antwort unlesbar: {e}"))?;

    let needle_currency = format!("currency='{}'", target);
    let needle_currency_dq = format!("currency=\"{}\"", target);
    let cube_start = body
        .find(&needle_currency)
        .or_else(|| body.find(&needle_currency_dq))
        .ok_or_else(|| format!("Währung {target} nicht in EZB-Tageskurs gelistet."))?;

    let slice = &body[cube_start..];
    let rate_pos = slice
        .find("rate=")
        .ok_or_else(|| "rate-Attribut fehlt".to_string())?;
    let after = &slice[rate_pos + 5..];
    let quote = after
        .chars()
        .next()
        .ok_or_else(|| "leeres rate-Attribut".to_string())?;
    if quote != '\'' && quote != '"' {
        return Err("ungültiges rate-Attribut".to_string());
    }
    let rest = &after[1..];
    let end = rest
        .find(quote)
        .ok_or_else(|| "rate-Attribut nicht terminiert".to_string())?;
    Ok(rest[..end].to_string())
}
