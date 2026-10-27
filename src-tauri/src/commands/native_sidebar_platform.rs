use super::SidebarSnapshot;
use crate::errors::CommandError;
use std::ffi::{c_char, c_void, CStr, CString};
use tauri::Emitter;

extern "C" {
    fn ss_sidebar_update(
        webview: *mut c_void,
        json: *const c_char,
        context: *mut c_void,
        action: extern "C" fn(*mut c_void, *const c_char),
        release: extern "C" fn(*mut c_void),
        error: *mut *mut c_char,
    ) -> bool;
    fn ss_sidebar_remove(webview: *mut c_void, mount_id: *const c_char);
    fn ss_sidebar_free_error(error: *mut c_char);
}

struct CallbackContext {
    window: tauri::WebviewWindow,
}

extern "C" fn release_context(context: *mut c_void) {
    if !context.is_null() {
        // The AppKit host owns this allocation and releases it exactly once.
        unsafe { drop(Box::from_raw(context.cast::<CallbackContext>())) };
    }
}

extern "C" fn dispatch(context: *mut c_void, json: *const c_char) {
    // Never unwind across the Objective-C/C boundary, including on shutdown.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if context.is_null() || json.is_null() {
            return;
        }
        let context = unsafe { &*context.cast::<CallbackContext>() };
        let text = unsafe { CStr::from_ptr(json) }.to_string_lossy();
        let Ok(mut payload) = serde_json::from_str::<serde_json::Value>(&text) else {
            return;
        };
        payload["windowLabel"] = context.window.label().into();
        if let Err(error) =
            context
                .window
                .emit_to(context.window.label(), "native-sidebar-action", payload)
        {
            tracing::warn!(%error, "Could not deliver native sidebar action");
        }
    }));
}

pub async fn update(
    window: tauri::WebviewWindow,
    snapshot: SidebarSnapshot,
) -> Result<bool, CommandError> {
    let json = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;
    let json = CString::new(json).map_err(|error| error.to_string())?;
    let callback_window = window.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let context = Box::into_raw(Box::new(CallbackContext {
                window: callback_window,
            }));
            let mut error = std::ptr::null_mut();
            let mounted = unsafe {
                ss_sidebar_update(
                    webview.inner().cast(),
                    json.as_ptr(),
                    context.cast(),
                    dispatch,
                    release_context,
                    &mut error,
                )
            };
            let result = if error.is_null() {
                Ok(mounted)
            } else {
                let message = unsafe { CStr::from_ptr(error) }
                    .to_string_lossy()
                    .into_owned();
                unsafe { ss_sidebar_free_error(error) };
                Err(CommandError::expected(message))
            };
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?
}

pub async fn remove(window: tauri::WebviewWindow, mount_id: String) -> Result<(), CommandError> {
    let mount_id = CString::new(mount_id).map_err(|error| error.to_string())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            unsafe { ss_sidebar_remove(webview.inner().cast(), mount_id.as_ptr()) };
            let _ = sender.send(());
        })
        .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?;
    Ok(())
}
