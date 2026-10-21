//! Publishing the remote server through Tailscale Funnel.
//!
//! Funnel gives this Mac a stable public HTTPS address on the user's *own*
//! tailnet (`https://<machine>.<tailnet>.ts.net`). Traffic goes from the
//! chat service straight to Tailscale's edge and on to this machine; it never
//! passes through anything Ship Studio runs, and the address belongs to the
//! user's Tailscale account, not to us.
//!
//! The server is mounted at [`MOUNT_PATH`] rather than the root, so turning
//! remote access on or off never touches anything else the user serves.
//!
//! Everything reported here is read back from the `tailscale` CLI. A Funnel
//! is "on" only when `tailscale funnel status --json` shows our mount
//! proxying to our port with funnel allowed — never because a command we
//! ran exited zero.

use crate::errors::CommandError;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncReadExt;

pub const MOUNT_PATH: &str = "/shipstudio";

/// Where the CLI lives. The Mac App Store / standalone app ships it inside
/// the bundle; Homebrew and the open-source build put it on PATH.
fn candidate_binaries() -> Vec<std::path::PathBuf> {
    let mut out = vec![
        std::path::PathBuf::from("/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
        std::path::PathBuf::from("/opt/homebrew/bin/tailscale"),
        std::path::PathBuf::from("/usr/local/bin/tailscale"),
    ];
    if let Ok(found) = which::which("tailscale") {
        out.insert(0, found);
    }
    out
}

pub fn find_binary() -> Option<std::path::PathBuf> {
    candidate_binaries().into_iter().find(|p| p.is_file())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "state"
)]
pub enum TailscaleState {
    /// No CLI found anywhere we look.
    NotInstalled,
    /// Installed, but the daemon isn't running or isn't logged in.
    NeedsLogin,
    /// Logged in. `dns_name` is this machine's tailnet name.
    Connected { dns_name: String },
    /// The CLI answered with something we could not read.
    Unknown { detail: String },
}

async fn run_cli(args: &[&str], timeout_secs: u64) -> Result<std::process::Output, CommandError> {
    let bin = find_binary().ok_or_else(|| CommandError::expected("Tailscale isn't installed."))?;
    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(args);
    crate::external_command::run_with_timeout(cmd, "tailscale", timeout_secs).await
}

/// Read `BackendState` and `Self.DNSName` out of `tailscale status --json`.
pub fn parse_status(json: &Value) -> TailscaleState {
    let backend = json
        .get("BackendState")
        .and_then(Value::as_str)
        .unwrap_or("");
    if backend != "Running" {
        return TailscaleState::NeedsLogin;
    }
    match json
        .pointer("/Self/DNSName")
        .and_then(Value::as_str)
        .map(|n| n.trim_end_matches('.'))
    {
        Some(name) if !name.is_empty() => TailscaleState::Connected {
            dns_name: name.to_string(),
        },
        _ => TailscaleState::Unknown {
            detail: "Tailscale is running but didn't report this machine's name.".to_string(),
        },
    }
}

pub async fn status() -> TailscaleState {
    if find_binary().is_none() {
        return TailscaleState::NotInstalled;
    }
    let output = match run_cli(&["status", "--json"], 8).await {
        Ok(o) => o,
        Err(e) => {
            return TailscaleState::Unknown {
                detail: e.to_string(),
            }
        }
    };
    // `status` exits non-zero when logged out but still prints JSON.
    match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(json) => parse_status(&json),
        Err(_) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            if stderr.contains("not running")
                || stderr.contains("logged out")
                || stderr.contains("failed to connect")
            {
                TailscaleState::NeedsLogin
            } else {
                TailscaleState::Unknown {
                    detail: stderr.trim().to_string(),
                }
            }
        }
    }
}

/// Is our mount funnelled to `port` on `dns_name`, per `tailscale funnel
/// status --json`? The serve config shape is:
///
/// ```json
/// { "Web": { "host.ts.net:443": { "Handlers": { "/shipstudio": { "Proxy": "http://127.0.0.1:4321" } } } },
///   "AllowFunnel": { "host.ts.net:443": true } }
/// ```
pub fn funnel_routes_to(config: &Value, dns_name: &str, port: u16) -> bool {
    let host_port = format!("{dns_name}:443");
    let allowed = config
        .get("AllowFunnel")
        .and_then(|a| a.get(&host_port))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let proxy = config
        .get("Web")
        .and_then(|w| w.get(&host_port))
        .and_then(|h| h.pointer("/Handlers"))
        .and_then(|h| h.get(MOUNT_PATH))
        .and_then(|h| h.get("Proxy"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let proxy = proxy.trim_end_matches('/');
    allowed
        && (proxy == format!("http://127.0.0.1:{port}")
            || proxy == format!("http://localhost:{port}"))
}

pub async fn funnel_active(dns_name: &str, port: u16) -> bool {
    let Ok(output) = run_cli(&["funnel", "status", "--json"], 8).await else {
        return false;
    };
    serde_json::from_slice::<Value>(&output.stdout)
        .map(|config| funnel_routes_to(&config, dns_name, port))
        .unwrap_or(false)
}

/// What happened when we asked for a Funnel.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum FunnelOutcome {
    On,
    /// The tailnet hasn't allowed Funnel (or HTTPS certificates) yet. The CLI
    /// prints a login.tailscale.com link where the owner switches it on.
    NeedsApproval {
        url: String,
    },
    Failed {
        detail: String,
    },
}

/// Find the first `https://login.tailscale.com/...` link in CLI output.
pub fn approval_url(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|w| w.starts_with("https://login.tailscale.com/"))
        .map(|w| w.trim_end_matches(['.', ',', ')']).to_string())
}

/// Turn the Funnel on for our mount.
///
/// Not run through `run_with_timeout`: when Funnel needs approval the CLI
/// prints the approval link and then *waits* for it, so the useful output
/// arrives before the command ends — and a timeout that discards captured
/// output would throw away the one thing we need. This reads both streams as
/// they arrive and stops as soon as it sees the link, the process exits, or
/// the deadline passes; the child is killed on drop either way.
pub async fn enable_funnel(port: u16) -> FunnelOutcome {
    let Some(bin) = find_binary() else {
        return FunnelOutcome::Failed {
            detail: "Tailscale isn't installed.".to_string(),
        };
    };
    let target = format!("http://127.0.0.1:{port}");
    let set_path = format!("--set-path={MOUNT_PATH}");
    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(["funnel", "--bg", "--https=443", &set_path, &target])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return FunnelOutcome::Failed {
                detail: format!("Could not run tailscale: {e}"),
            }
        }
    };
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    let mut captured = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    let mut out_buf = [0u8; 2048];
    let mut err_buf = [0u8; 2048];

    loop {
        if let Some(url) = approval_url(&captured) {
            return FunnelOutcome::NeedsApproval { url };
        }
        tokio::select! {
            n = async { match stdout.as_mut() { Some(s) => s.read(&mut out_buf).await, None => std::future::pending().await } } => {
                match n { Ok(0) | Err(_) => stdout = None, Ok(n) => captured.push_str(&String::from_utf8_lossy(&out_buf[..n])) }
            }
            n = async { match stderr.as_mut() { Some(s) => s.read(&mut err_buf).await, None => std::future::pending().await } } => {
                match n { Ok(0) | Err(_) => stderr = None, Ok(n) => captured.push_str(&String::from_utf8_lossy(&err_buf[..n])) }
            }
            status = child.wait(), if stdout.is_none() && stderr.is_none() => {
                if let Some(url) = approval_url(&captured) {
                    return FunnelOutcome::NeedsApproval { url };
                }
                return match status {
                    Ok(s) if s.success() => FunnelOutcome::On,
                    _ => FunnelOutcome::Failed { detail: captured.trim().to_string() },
                };
            }
            _ = tokio::time::sleep_until(deadline) => {
                return FunnelOutcome::Failed {
                    detail: if captured.trim().is_empty() {
                        "Tailscale didn't answer within 20 seconds.".to_string()
                    } else {
                        captured.trim().to_string()
                    },
                };
            }
        }
    }
}

/// Remove our mount from the Funnel. Leaves anything else the user serves.
pub async fn disable_funnel() -> Result<(), CommandError> {
    let set_path = format!("--set-path={MOUNT_PATH}");
    let output = run_cli(&["funnel", "--https=443", &set_path, "off"], 10).await?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Already off is the outcome we wanted.
    if stderr.contains("not found") || stderr.contains("does not exist") {
        return Ok(());
    }
    Err(CommandError::expected(format!(
        "Tailscale couldn't turn the link off: {}",
        stderr.trim()
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn running_with_a_name_is_connected() {
        let s = parse_status(&json!({
            "BackendState": "Running",
            "Self": { "DNSName": "studio-mac.tail1234.ts.net." }
        }));
        assert_eq!(
            s,
            TailscaleState::Connected {
                dns_name: "studio-mac.tail1234.ts.net".to_string()
            }
        );
    }

    #[test]
    fn anything_but_running_needs_login() {
        for state in ["NeedsLogin", "Stopped", "Starting", "NoState"] {
            assert_eq!(
                parse_status(&json!({ "BackendState": state })),
                TailscaleState::NeedsLogin
            );
        }
    }

    #[test]
    fn running_without_a_name_is_not_claimed_as_connected() {
        assert!(matches!(
            parse_status(&json!({ "BackendState": "Running", "Self": {} })),
            TailscaleState::Unknown { .. }
        ));
    }

    #[test]
    fn funnel_is_on_only_when_our_mount_routes_to_our_port() {
        let host = "m.t.ts.net";
        let config = json!({
            "Web": { "m.t.ts.net:443": { "Handlers": { "/shipstudio": { "Proxy": "http://127.0.0.1:4321" } } } },
            "AllowFunnel": { "m.t.ts.net:443": true }
        });
        assert!(funnel_routes_to(&config, host, 4321));
        assert!(!funnel_routes_to(&config, host, 9999), "wrong port");

        let served_not_funnelled = json!({
            "Web": { "m.t.ts.net:443": { "Handlers": { "/shipstudio": { "Proxy": "http://127.0.0.1:4321" } } } }
        });
        assert!(!funnel_routes_to(&served_not_funnelled, host, 4321));

        let someone_elses_root = json!({
            "Web": { "m.t.ts.net:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:4321" } } } },
            "AllowFunnel": { "m.t.ts.net:443": true }
        });
        assert!(!funnel_routes_to(&someone_elses_root, host, 4321));
        assert!(!funnel_routes_to(&json!({}), host, 4321));
    }

    #[test]
    fn serializes_the_shape_the_frontend_reads() {
        let s = TailscaleState::Connected {
            dns_name: "m.t.ts.net".into(),
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({ "state": "connected", "dnsName": "m.t.ts.net" })
        );
        assert_eq!(
            serde_json::to_value(TailscaleState::NotInstalled).unwrap(),
            json!({ "state": "notInstalled" })
        );
    }

    #[test]
    fn finds_the_approval_link() {
        let out = "Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=abc123\n\n";
        assert_eq!(
            approval_url(out).as_deref(),
            Some("https://login.tailscale.com/f/funnel?node=abc123")
        );
        assert_eq!(
            approval_url("Available on the internet: https://m.t.ts.net/shipstudio"),
            None
        );
    }
}
