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

      Prop("accessibilityLabel") { (view: MacOSExpoUIButton, accessibilityLabel: String?) in
        view.accessibilityText = accessibilityLabel
      }

      Prop("buttonRole") { (view: MacOSExpoUIButton, buttonRole: MacOSExpoUIButtonRole?) in
        view.buttonRole = buttonRole
      }

      Prop("controlSize") { (view: MacOSExpoUIButton, controlSize: MacOSExpoUIControlSize?) in
        view.controlSize = controlSize ?? .regular
      }

      Prop("variant") { (view: MacOSExpoUIButton, variant: String?) in
        view.variant = variant ?? "default"
      }

      Prop("color") { (view: MacOSExpoUIButton, color: String?) in
        view.color = color
      }

      Prop("disabled") { (view: MacOSExpoUIButton, disabled: Bool) in
        view.disabled = disabled
      }

      Events("onButtonPressed")
    }

    View(MacOSExpoUISwitch.self) {
      ViewName("SwitchView")

      Prop("value") { (view: MacOSExpoUISwitch, value: Bool) in
        view.value = value
      }

      Prop("label") { (view: MacOSExpoUISwitch, label: String?) in
        view.label = label
      }

      Prop("color") { (view: MacOSExpoUISwitch, color: String?) in
        view.color = color
      }

      Prop("variant") { (view: MacOSExpoUISwitch, variant: String?) in
        view.variant = variant ?? "switch"
      }

      Events("onValueChange")
    }

    View(MacOSExpoUIImage.self) {
      ViewName("ImageView")

      Prop("systemName") { (view: MacOSExpoUIImage, systemName: String) in
        view.systemName = systemName
      }

      Prop("size") { (view: MacOSExpoUIImage, size: Double?) in
        view.size = size.map { CGFloat($0) } ?? 16
      }

      Prop("color") { (view: MacOSExpoUIImage, color: String?) in
        view.color = color
      }
    }

    View(MacOSExpoUILabel.self) {
      ViewName("LabelView")

      Prop("title") { (view: MacOSExpoUILabel, title: String?) in
        view.title = title
      }

      Prop("systemImage") { (view: MacOSExpoUILabel, systemImage: String?) in
        view.systemImage = systemImage
      }

      Prop("color") { (view: MacOSExpoUILabel, color: String?) in
        view.color = color
      }
    }

    View(MacOSExpoUIDivider.self) {
      ViewName("DividerView")
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
  private var glassSurface: NSView?
  private let onButtonPressed = EventDispatcher()

  var text: String? {
    didSet {
      button.title = text ?? ""
      updateAccessibility()
    }
  }

  var systemImage: String? {
    didSet {
      button.image = systemImage.flatMap {
        NSImage(
          systemSymbolName: $0,
          accessibilityDescription: accessibilityText ?? text
        )
      }
      button.imagePosition = text == nil ? .imageOnly : .imageLeading
      updateAccessibility()
    }
  }

  var accessibilityText: String? {
    didSet {
      updateAccessibility()
    }
  }

  var buttonRole: MacOSExpoUIButtonRole? {
    didSet {
      updateAppearance()
    }
  }

  var controlSize = MacOSExpoUIControlSize.regular {
    didSet {
      button.controlSize = controlSize.nativeValue
    }
  }

  var variant = "default" {
    didSet {
      updateAppearance()
    }
  }

  var color: String? {
    didSet {
      updateAppearance()
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
    updateAppearance()
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    if let glassSurface {
      glassSurface.frame = bounds
      button.frame = glassSurface.bounds
      if #available(macOS 26.0, *),
         let glass = glassSurface as? NSGlassEffectView {
        glass.cornerRadius = bounds.height / 2
      }
    } else {
      button.frame = bounds
    }
  }

  @objc private func buttonPressed() {
    onButtonPressed()
  }

  private func updateAppearance() {
    let tint = color.flatMap(NSColor.fromExpoColor)
      ?? (buttonRole == .destructive ? .systemRed : .controlAccentColor)
    let isPlain = ["plain", "borderless", "link"].contains(variant)
    let isGlass = ["glass", "glassProminent"].contains(variant)

    updateGlassHierarchy(isGlass: isGlass, tint: tint)
    button.isBordered = !isPlain && !isGlass
    button.bezelStyle = .rounded
    button.contentTintColor = variant == "glassProminent" ? .white : tint
    button.layer?.backgroundColor = NSColor.clear.cgColor
    button.layer?.cornerRadius = 6
    needsLayout = true
  }

  private func updateAccessibility() {
    button.setAccessibilityLabel(accessibilityText ?? text)
  }

  private func updateGlassHierarchy(isGlass: Bool, tint: NSColor) {
    guard #available(macOS 26.0, *) else {
      return
    }

    if isGlass {
      let glass: NSGlassEffectView
      if let existing = glassSurface as? NSGlassEffectView {
        glass = existing
      } else {
        button.removeFromSuperview()
        glass = NSGlassEffectView()
        glass.style = .regular
        glass.contentView = button
        addSubview(glass)
        glassSurface = glass
      }
      glass.tintColor = variant == "glassProminent"
        ? tint.withAlphaComponent(0.34)
        : tint.withAlphaComponent(0.12)
    } else if let glass = glassSurface as? NSGlassEffectView {
      glass.contentView = nil
      glass.removeFromSuperview()
      glassSurface = nil
      addSubview(button)
    }
  }
}

private final class MacOSExpoUISwitch: ExpoView {
  private let toggle = NSSwitch()
  private let onValueChange = EventDispatcher()

  var value = false {
    didSet {
      let nextState: NSControl.StateValue = value ? .on : .off
      if toggle.state != nextState {
        toggle.state = nextState
      }
    }
  }

  var label: String? {
    didSet {
      toggle.setAccessibilityLabel(label)
    }
  }

  var color: String?
  var variant = "switch"

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    toggle.controlSize = .regular
    toggle.target = self
    toggle.action = #selector(valueChanged)
    toggle.autoresizingMask = [.width, .height]
    addSubview(toggle)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    toggle.frame = bounds
  }

  @objc private func valueChanged() {
    value = toggle.state == .on
    onValueChange(["value": value])
  }
}

private final class MacOSExpoUILabel: ExpoView {
  private let labelView = NSButton()

  var title: String? {
    didSet {
      labelView.title = title ?? ""
      labelView.setAccessibilityLabel(title)
    }
  }

  var systemImage: String? {
    didSet {
      labelView.image = systemImage.flatMap {
        NSImage(systemSymbolName: $0, accessibilityDescription: title)
      }
      labelView.imagePosition = systemImage == nil ? .noImage : .imageLeading
    }
  }

  var color: String? {
    didSet {
      let tint = color.flatMap(NSColor.fromExpoColor) ?? .secondaryLabelColor
      labelView.contentTintColor = tint
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    labelView.alignment = .left
    labelView.bezelStyle = .inline
    labelView.font = .systemFont(ofSize: 10, weight: .semibold)
    labelView.imageHugsTitle = true
    labelView.isBordered = false
    labelView.contentTintColor = .secondaryLabelColor
    labelView.setAccessibilityRole(.staticText)
    labelView.autoresizingMask = [.width, .height]
    addSubview(labelView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    labelView.frame = bounds
  }
}

private final class MacOSExpoUIDivider: ExpoView {
  private let separator = NSBox()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    separator.boxType = .separator
    separator.autoresizingMask = [.width, .height]
    addSubview(separator)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    separator.frame = bounds
  }
}

private final class MacOSExpoUIImage: ExpoView {
  private let imageView = NSImageView()

  var systemName = "questionmark.circle" {
    didSet {
      updateImage()
    }
  }

  var size: CGFloat = 16 {
    didSet {
      updateImage()
    }
  }

  var color: String? {
    didSet {
      imageView.contentTintColor = color.flatMap(NSColor.fromExpoColor) ?? .controlAccentColor
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    imageView.imageAlignment = .alignCenter
    imageView.imageScaling = .scaleProportionallyDown
    imageView.contentTintColor = .controlAccentColor
    imageView.autoresizingMask = [.width, .height]
    addSubview(imageView)
    updateImage()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
  }

  private func updateImage() {
    let configuration = NSImage.SymbolConfiguration(pointSize: size, weight: .regular)
    let image = NSImage(
      systemSymbolName: systemName,
      accessibilityDescription: systemName
    )?.withSymbolConfiguration(configuration)
    image?.isTemplate = true
    imageView.image = image
  }
}

private extension NSColor {
  static func fromExpoColor(_ value: String) -> NSColor? {
    switch value.lowercased() {
    case "accent", "blue":
      return .controlAccentColor
    case "red":
      return .systemRed
    case "orange":
      return .systemOrange
    case "yellow":
      return .systemYellow
    case "green":
      return .systemGreen
    case "gray", "grey":
      return .secondaryLabelColor
    case "white":
      return .white
    default:
      break
    }

    let hex = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard hex.count == 6, let number = UInt64(hex, radix: 16) else {
      return nil
    }

    return NSColor(
      red: CGFloat((number >> 16) & 0xff) / 255,
      green: CGFloat((number >> 8) & 0xff) / 255,
      blue: CGFloat(number & 0xff) / 255,
      alpha: 1
    )
  }
}
