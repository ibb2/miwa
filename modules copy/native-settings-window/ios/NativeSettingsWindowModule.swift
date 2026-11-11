import AppKit
import ExpoModulesCore

public let miwaCloseSettingsWindowNotification = Notification.Name("MiwaCloseSettingsWindow")

public final class NativeSettingsWindowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeSettingsWindow")

    // Routes through the responder chain to AppDelegate.openSettingsWindow(_:),
    // which owns the React root view factory. This module never touches React.
    AsyncFunction("openSettings") {
      await MainActor.run {
        NSApp.sendAction(Selector(("openSettingsWindow:")), to: nil, from: nil)
      }
    }

    AsyncFunction("closeSettings") {
      await MainActor.run {
        NotificationCenter.default.post(
          name: miwaCloseSettingsWindowNotification,
          object: nil
        )
      }
    }
  }
}
