import AppKit
import ExpoModulesCore

public final class ExpoUIMacOSModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoUI")

    View(MacOSExpoUIHost.self) {
      ViewName("HostView")

      Events("onLayoutContent")
    }

    View(MacOSExpoUIButton.self) {
      ViewName("Button")

      Prop("text") { (view: MacOSExpoUIButton, text: String?) in
        view.text = text
      }

      Prop("systemImage") { (view: MacOSExpoUIButton, systemImage: String?) in
        view.systemImage = systemImage
      }

      Prop("buttonRole") { (view: MacOSExpoUIButton, buttonRole: MacOSExpoUIButtonRole?) in
        view.buttonRole = buttonRole
      }

      Prop("controlSize") { (view: MacOSExpoUIButton, controlSize: MacOSExpoUIControlSize?) in
        view.controlSize = controlSize ?? .regular
      }

      Prop("disabled") { (view: MacOSExpoUIButton, disabled: Bool) in
        view.disabled = disabled
      }

      Events("onButtonPressed")
    }
  }
}

private final class MacOSExpoUIHost: ExpoView {
  private let onLayoutContent = EventDispatcher()
  private var lastReportedSize = CGSize.zero

  override func layoutSubviews() {
    super.layoutSubviews()

    for child in subviews {
      child.frame = bounds
    }

    guard bounds.size != lastReportedSize else {
      return
    }
    lastReportedSize = bounds.size
    onLayoutContent([
      "width": bounds.width,
      "height": bounds.height
    ])
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    super.mountChildComponentView(childComponentView, index: index)
    childComponentView.autoresizingMask = [.width, .height]
    childComponentView.frame = bounds
  }
}

private enum MacOSExpoUIButtonRole: String, Enumerable {
  case `default`
  case cancel
  case destructive
}

private enum MacOSExpoUIControlSize: String, Enumerable {
  case mini
  case small
  case regular
  case large
  case extraLarge

  var nativeValue: NSControl.ControlSize {
    switch self {
    case .mini:
      return .mini
    case .small:
      return .small
    case .regular:
      return .regular
    case .large, .extraLarge:
      return .large
    }
  }
}

private final class MacOSExpoUIButton: ExpoView {
  private let button = NSButton()
  private let onButtonPressed = EventDispatcher()

  var text: String? {
    didSet {
      button.title = text ?? ""
    }
  }

  var systemImage: String? {
    didSet {
      button.image = systemImage.flatMap {
        NSImage(systemSymbolName: $0, accessibilityDescription: text)
      }
      button.imagePosition = text == nil ? .imageOnly : .imageLeading
    }
  }

  var buttonRole: MacOSExpoUIButtonRole? {
    didSet {
      button.layer?.backgroundColor = (
        buttonRole == .destructive ? NSColor.systemRed : NSColor.controlAccentColor
      ).cgColor
    }
  }

  var controlSize = MacOSExpoUIControlSize.regular {
    didSet {
      button.controlSize = controlSize.nativeValue
    }
  }

  var disabled = false {
    didSet {
      button.isEnabled = !disabled
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    button.bezelStyle = .rounded
    button.isBordered = false
    button.wantsLayer = true
    button.layer?.backgroundColor = NSColor.controlAccentColor.cgColor
    button.layer?.cornerRadius = 6
    button.contentTintColor = .white
    button.controlSize = .regular
    button.target = self
    button.action = #selector(buttonPressed)
    button.autoresizingMask = [.width, .height]
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  @objc private func buttonPressed() {
    onButtonPressed()
  }
}
