//! Update check with a selectable release channel.
//!
//! The JS `check()` of the updater plugin can only use the endpoints from
//! `tauri.conf.json`, so the beta channel needs its own command. The returned
//! metadata mirrors the plugin's own `check` response: the frontend wraps it in
//! the plugin's `Update` class and installs through the regular plugin commands,
//! which look the update up by `rid` in the webview's resource table.

use serde::{Deserialize, Serialize};
use tauri::{Manager, ResourceId, Url, Webview};
use tauri_plugin_updater::UpdaterExt;

/// Rolling feed CI rewrites on every published release (stable or pre-release)
/// whose version is newer than the feed's (`.github/workflows/update-feed.yml`).
const BETA_FEED_URL: &str =
    "https://github.com/jonax1337/zettel/releases/download/beta-feed/latest.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    /// Endpoints from `tauri.conf.json` (`releases/latest`, never a pre-release).
    Stable,
    Beta,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[tauri::command]
pub async fn check_for_update(
    webview: Webview,
    channel: UpdateChannel,
) -> Result<Option<UpdateMetadata>, String> {
    let mut builder = webview.updater_builder();
    if channel == UpdateChannel::Beta {
        let feed = Url::parse(BETA_FEED_URL).map_err(|e| e.to_string())?;
        builder = builder.endpoints(vec![feed]).map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}
