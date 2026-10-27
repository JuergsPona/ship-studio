use super::ThemeControlSnapshot;
use crate::errors::CommandError;
use std::ffi::{c_char, c_void, CStr, CString};
use tauri::Emitter;

extern "C" {
    fn ss_theme_control_update(
        webview: *mut c_void,
        json: *const c_char,
        context: *mut c_void,
        callback: extern "C" fn(*mut c_void, *const c_char),
        release: extern "C" fn(*mut c_void),
        error: *mut *mut c_char,
    ) -> bool;
    fn ss_theme_control_remove(webview: *mut c_void, mount_id: *const c_char);
    fn ss_theme_control_focus(webview: *mut c_void, mount_id: *const c_char);
    fn ss_theme_control_free_error(error: *mut c_char);
}

extern "C" fn release_context(context: *mut c_void) {
    if !context.is_null() {
        unsafe { drop(Box::from_raw(context.cast::<tauri::WebviewWindow>())) };
    }
}

extern "C" fn dispatch(context: *mut c_void, json: *const c_char) {
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if context.is_null() || json.is_null() {
            return;
        }
        let window = unsafe { &*context.cast::<tauri::WebviewWindow>() };
        let text = unsafe { CStr::from_ptr(json) }.to_string_lossy();
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Err(error) =
                window.emit_to(window.label(), "native-theme-control-action", payload)
            {
                tracing::warn!(%error, "Could not deliver native appearance action");
            }
        }
    }));
}

pub async fn update(
    window: tauri::WebviewWindow,
    snapshot: ThemeControlSnapshot,
) -> Result<bool, CommandError> {
    let json = CString::new(serde_json::to_string(&snapshot).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    let callback_window = window.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let context = Box::into_raw(Box::new(callback_window));
            let mut error = std::ptr::null_mut();
            let supported = unsafe {
                ss_theme_control_update(
                    webview.inner(),
                    json.as_ptr(),
                    context.cast(),
                    dispatch,
                    release_context,
                    &mut error,
                )
            };
            let result = if error.is_null() {
                Ok(supported)
            } else {
                let message = unsafe { CStr::from_ptr(error) }
                    .to_string_lossy()
                    .into_owned();
                unsafe { ss_theme_control_free_error(error) };
                Err(CommandError::expected(message))
            };
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?
}

pub async fn operate(
    window: tauri::WebviewWindow,
    mount_id: String,
    focus: bool,
) -> Result<(), CommandError> {
    let mount_id = CString::new(mount_id).map_err(|error| error.to_string())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            unsafe {
                if focus {
                    ss_theme_control_focus(webview.inner(), mount_id.as_ptr());
                } else {
                    ss_theme_control_remove(webview.inner(), mount_id.as_ptr());
                }
            }
            let _ = sender.send(());
        })
        .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?;
    Ok(())
}
