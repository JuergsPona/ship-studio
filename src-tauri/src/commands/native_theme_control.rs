//! A window-scoped AppKit appearance selector, positioned in the Settings modal.

use crate::errors::CommandError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ThemeControlRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeControlSnapshot {
    pub mount_id: String,
    pub frame: ThemeControlRect,
    pub clip: ThemeControlRect,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub preference: String,
    pub enabled: bool,
    pub visible: bool,
}

fn validate_snapshot(snapshot: &ThemeControlSnapshot) -> Result<(), CommandError> {
    let valid_rect = |rect: &ThemeControlRect| {
        [rect.x, rect.y, rect.width, rect.height]
            .iter()
            .all(|value| value.is_finite())
            && rect.width >= 0.0
            && rect.height >= 0.0
    };
    if snapshot.mount_id.is_empty()
        || snapshot.mount_id.len() > 128
        || !valid_rect(&snapshot.frame)
        || !valid_rect(&snapshot.clip)
        || !snapshot.viewport_width.is_finite()
        || !snapshot.viewport_height.is_finite()
        || snapshot.viewport_width <= 0.0
        || snapshot.viewport_height <= 0.0
        || !matches!(snapshot.preference.as_str(), "light" | "dark" | "system")
        || (snapshot.visible
            && (snapshot.frame.width == 0.0
                || snapshot.frame.height == 0.0
                || snapshot.clip.width == 0.0
                || snapshot.clip.height == 0.0))
    {
        return Err(CommandError::Validation {
            field: "native appearance control".into(),
            reason: "Invalid control geometry or theme preference".into(),
        });
    }
    Ok(())
}

#[tauri::command]
#[tracing::instrument(skip(window, snapshot), fields(window = %window.label()))]
pub async fn update_native_theme_control(
    window: tauri::WebviewWindow,
    snapshot: ThemeControlSnapshot,
) -> Result<bool, CommandError> {
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
pub async fn remove_native_theme_control(
    window: tauri::WebviewWindow,
    mount_id: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    platform::operate(window, mount_id, false).await?;
    #[cfg(not(target_os = "macos"))]
    let _ = (window, mount_id);
    Ok(())
}

#[tauri::command]
#[tracing::instrument(skip(window), fields(window = %window.label()))]
pub async fn focus_native_theme_control(
    window: tauri::WebviewWindow,
    mount_id: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    platform::operate(window, mount_id, true).await?;
    #[cfg(not(target_os = "macos"))]
    let _ = (window, mount_id);
    Ok(())
}

#[cfg(target_os = "macos")]
#[path = "native_theme_control_platform.rs"]
mod platform;

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> ThemeControlSnapshot {
        ThemeControlSnapshot {
            mount_id: "theme-test".into(),
            frame: ThemeControlRect {
                x: 16.0,
                y: 100.0,
                width: 320.0,
                height: 30.0,
            },
            clip: ThemeControlRect {
                x: 16.0,
                y: 100.0,
                width: 320.0,
                height: 30.0,
            },
            viewport_width: 1200.0,
            viewport_height: 800.0,
            preference: "system".into(),
            enabled: true,
            visible: true,
        }
    }

    #[test]
    fn accepts_logical_coordinates_and_all_theme_choices() {
        let mut value = snapshot();
        for preference in ["light", "dark", "system"] {
            value.preference = preference.into();
            assert!(validate_snapshot(&value).is_ok());
        }
        assert_eq!(
            serde_json::to_value(&value).unwrap()["viewportWidth"],
            1200.0
        );
    }

    #[test]
    fn rejects_invalid_geometry_and_icon_values() {
        let mut value = snapshot();
        value.frame.x = f64::NAN;
        assert!(validate_snapshot(&value).is_err());
        value = snapshot();
        value.viewport_width = 0.0;
        assert!(validate_snapshot(&value).is_err());
        value = snapshot();
        value.clip.height = 0.0;
        assert!(validate_snapshot(&value).is_err());
        value = snapshot();
        value.preference = "brand".into();
        assert!(validate_snapshot(&value).is_err());
    }
}
