fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/native_sidebar");
        cc::Build::new()
            .file("src/native_sidebar/SidebarHost.m")
            .file("src/native_sidebar/SidebarOutline.m")
            .flag("-fobjc-arc")
            .compile("ship_native_sidebar");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
        println!("cargo:rerun-if-changed=src/native_theme_control/ThemeControl.m");
        cc::Build::new()
            .file("src/native_theme_control/ThemeControl.m")
            .flag("-fobjc-arc")
            .compile("ship_native_theme_control");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
    }
    tauri_build::build()
}
