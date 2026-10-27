//! Window-scoped AppKit sidebar. Native controls dispatch presentation action
//! IDs back to the existing frontend handlers; this module never executes paths.

use crate::errors::CommandError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarAction {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub symbol: Option<String>,
    pub selected: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SidebarSlider {
    pub action: SidebarAction,
    pub value: f64,
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarNode {
    pub id: String,
    pub title: String,
    pub detail: Option<String>,
    pub symbol: Option<String>,
    pub tone: Option<String>,
    pub selected: Option<bool>,
    pub busy: Option<bool>,
    pub expanded: Option<bool>,
    pub action: Option<SidebarAction>,
    pub toggle: Option<SidebarAction>,
    pub rename: Option<SidebarAction>,
    pub buttons: Option<Vec<SidebarAction>>,
    pub menu: Option<Vec<SidebarAction>>,
    pub children: Option<Vec<SidebarNode>>,
    pub drag_group: Option<String>,
    pub image_url: Option<String>,
    pub slider: Option<SidebarSlider>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SidebarFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarSnapshot {
    #[serde(default)]
    pub compact: bool,
    pub mount_id: String,
    pub revision: u64,
    pub frame: SidebarFrame,
    pub behind_webview: bool,
    pub top: Vec<SidebarNode>,
    pub body: Vec<SidebarNode>,
    pub footer: Vec<SidebarNode>,
    pub move_action: Option<SidebarAction>,
}

fn validate_snapshot(snapshot: &SidebarSnapshot) -> Result<(), CommandError> {
    let frame = &snapshot.frame;
    if snapshot.mount_id.is_empty()
        || snapshot.mount_id.len() > 128
        || ![frame.x, frame.y, frame.width, frame.height]
            .iter()
            .all(|value| value.is_finite())
        || frame.width <= 0.0
        || frame.height <= 0.0
    {
        return Err(CommandError::Validation {
            field: "native sidebar".into(),
            reason: "Invalid mount identity or view geometry".into(),
        });
    }
    fn visit(
        nodes: &[SidebarNode],
        depth: usize,
        ids: &mut std::collections::HashSet<String>,
    ) -> Result<(), CommandError> {
        if depth > 12 || ids.len() + nodes.len() > 4096 {
            return Err(CommandError::expected(
                "Sidebar presentation exceeds its limits",
            ));
        }
        for node in nodes {
            if node.id.is_empty() || !ids.insert(node.id.clone()) {
                return Err(CommandError::expected("Sidebar item IDs must be unique"));
            }
            if let Some(slider) = &node.slider {
                if ![slider.value, slider.min, slider.max]
                    .iter()
                    .all(|value| value.is_finite())
                    || slider.max <= slider.min
                    || slider.value < slider.min
                    || slider.value > slider.max
                {
                    return Err(CommandError::expected("Invalid sidebar slider range"));
                }
            }
            if let Some(children) = &node.children {
                visit(children, depth + 1, ids)?;
            }
        }
        Ok(())
    }
    let mut ids = std::collections::HashSet::new();
    for nodes in [&snapshot.top, &snapshot.body, &snapshot.footer] {
        visit(nodes, 0, &mut ids)?;
    }
    Ok(())
}

#[tauri::command]
#[tracing::instrument(skip(window, snapshot), fields(window = %window.label()))]
pub async fn update_native_sidebar(
    window: tauri::WebviewWindow,
    snapshot: SidebarSnapshot,
) -> Result<bool, CommandError> {
    // Development builds expose the native renderer for parity testing. Do
    // not replace the release sidebar until the native acceptance pass exists.
    const RELEASE_PARITY_VERIFIED: bool = false;
    if !cfg!(debug_assertions) && !RELEASE_PARITY_VERIFIED {
        return Ok(false);
    }
    validate_snapshot(&snapshot)?;
    #[cfg(target_os = "macos")]
    {
        platform::update(window, snapshot).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, snapshot);
        Ok(false)
    }
}

#[tauri::command]
#[tracing::instrument(skip(window), fields(window = %window.label()))]
pub async fn remove_native_sidebar(
    window: tauri::WebviewWindow,
    mount_id: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    {
        platform::remove(window, mount_id).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, mount_id);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
#[path = "native_sidebar_platform.rs"]
mod platform;

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> SidebarSnapshot {
        SidebarSnapshot {
            compact: false,
            mount_id: "test-mount".into(),
            revision: 1,
            frame: SidebarFrame {
                x: 8.0,
                y: 46.0,
                width: 219.0,
                height: 600.0,
            },
            behind_webview: false,
            top: vec![],
            body: vec![],
            footer: vec![],
            move_action: None,
        }
    }

    #[test]
    fn accepts_logical_coordinates_without_retina_scaling() {
        assert!(validate_snapshot(&snapshot()).is_ok());
    }

    #[test]
    fn rejects_non_finite_and_empty_view_geometry() {
        let mut value = snapshot();
        value.frame.x = f64::NAN;
        assert!(validate_snapshot(&value).is_err());
        value.frame.x = 8.0;
        value.frame.width = 0.0;
        assert!(validate_snapshot(&value).is_err());
    }

    #[test]
    fn round_trips_the_frontend_contract() {
        let value = snapshot();
        let json = serde_json::to_value(&value).expect("serializable snapshot");
        assert_eq!(json["mountId"], "test-mount");
        assert_eq!(json["behindWebview"], false);
        assert!(serde_json::from_value::<SidebarSnapshot>(json).is_ok());
    }

    #[test]
    fn retains_selected_navigation_state() {
        let action: SidebarAction = serde_json::from_value(serde_json::json!({
            "id": "navigation.home", "label": "Home", "enabled": true, "selected": true
        }))
        .expect("selected navigation action");
        assert!(action.enabled);
        assert_eq!(action.selected, Some(true));
        let json = serde_json::to_value(action).expect("serializable action");
        assert_eq!(json["selected"].as_bool(), Some(true));
    }

    #[test]
    fn rejects_duplicate_item_ids_across_sections() {
        let mut value = snapshot();
        let node: SidebarNode = serde_json::from_value(serde_json::json!({
            "id": "duplicate", "title": "Project"
        }))
        .expect("minimal node");
        value.top.push(node.clone());
        value.body.push(node);
        assert!(validate_snapshot(&value).is_err());
    }

    #[test]
    fn rejects_out_of_range_native_slider_values() {
        let mut value = snapshot();
        let node = serde_json::from_value(serde_json::json!({
            "id": "seek", "title": "Seek",
            "slider": {
                "action": { "id": "seek.commit", "label": "Seek", "enabled": true },
                "min": 0.0, "max": 120.0, "value": 121.0
            }
        }))
        .expect("slider node");
        value.top.push(node);
        assert!(validate_snapshot(&value).is_err());
    }
}
