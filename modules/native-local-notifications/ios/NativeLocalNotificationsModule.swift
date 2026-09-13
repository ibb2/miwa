import AppKit
import ExpoModulesCore
import UserNotifications

public let miwaShowMainWindowNotification = Notification.Name("MiwaShowMainWindow")

/// Persistent UNUserNotificationCenter delegate. Shows banners while Miwa is
/// frontmost and routes notification clicks to AppDelegate's disposable email windows.
final class MiwaNotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = MiwaNotificationCenterDelegate()
  var onResponse: (([AnyHashable: Any]) -> Void)?

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge, .list])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    onResponse?(userInfo)
    DispatchQueue.main.async {
      NotificationCenter.default.post(name: miwaShowMainWindowNotification, object: nil, userInfo: userInfo)
    }
    completionHandler()
  }
}

public final class NativeLocalNotificationsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeLocalNotifications")

    Events("onNotificationResponse")

    OnCreate {
      UNUserNotificationCenter.current().delegate = MiwaNotificationCenterDelegate.shared
      MiwaNotificationCenterDelegate.shared.onResponse = { [weak self] userInfo in
        DispatchQueue.main.async {
          self?.sendEvent("onNotificationResponse", [
            "accountId": userInfo["accountId"] as? String,
            "threadId": userInfo["threadId"] as? String,
          ])
        }
      }
    }

    AsyncFunction("getPermissionStatus") { () -> String in
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        return "authorized"
      case .denied:
        return "denied"
      case .notDetermined:
        return "notDetermined"
      @unknown default:
        return "notDetermined"
      }
    }

    // First call registers Miwa in System Settings > Notifications.
    AsyncFunction("requestPermissions") { () -> String in
      await MainActor.run {
        UNUserNotificationCenter.current().delegate = MiwaNotificationCenterDelegate.shared
      }
      do {
        let granted = try await UNUserNotificationCenter.current().requestAuthorization(
          options: [.alert, .sound, .badge]
        )
        return granted ? "authorized" : "denied"
      } catch {
        return "denied"
      }
    }

    AsyncFunction("postNewMail") {
      (
        identifier: String,
        title: String,
        body: String,
        sound: Bool,
        accountId: String,
        threadId: String
      ) in
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      if sound {
        content.sound = .default
      }
      content.userInfo = ["accountId": accountId, "threadId": threadId]
      let request = UNNotificationRequest(
        identifier: identifier, content: content, trigger: nil
      )
      try await UNUserNotificationCenter.current().add(request)
    }

    AsyncFunction("setBadgeCount") { (count: Int) in
      await MainActor.run {
        NSApplication.shared.dockTile.badgeLabel = count > 0 ? "\(count)" : nil
      }
    }

    AsyncFunction("clearDelivered") {
      UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    AsyncFunction("openSystemNotificationSettings") {
      await MainActor.run {
        if let url = URL(
          string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
        ) {
          NSWorkspace.shared.open(url)
        }
      }
    }
  }
}
