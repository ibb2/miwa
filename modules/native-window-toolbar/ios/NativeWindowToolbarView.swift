import AppKit
import ExpoModulesCore

private final class ToolbarProgressRing: NSView {
  var progress: Double = 0

  override func draw(_ dirtyRect: NSRect) {
    let center = NSPoint(x: bounds.midX, y: bounds.midY)
    let radius = min(bounds.width, bounds.height) / 2 - 2
    let track = NSBezierPath(ovalIn: NSRect(
      x: center.x - radius, y: center.y - radius,
      width: radius * 2, height: radius * 2
    ))
    track.lineWidth = 3
    NSColor.tertiaryLabelColor.setStroke()
    track.stroke()

    guard progress > 0 else { return }
    let arc = NSBezierPath()
    arc.lineWidth = 3
    arc.lineCapStyle = .round
    arc.appendArc(
      withCenter: center, radius: radius, startAngle: 90,
      endAngle: 90 - CGFloat(progress * 360), clockwise: true
    )
    NSColor.controlAccentColor.setStroke()
    arc.stroke()
  }
}

public final class NativeWindowToolbarView: ExpoView, NSToolbarDelegate, NSSearchFieldDelegate {
  public var toolbarIdentifier = "ExpoWindowToolbar"
  public var items: [ToolbarItemRecord] = []
  public var customizable = true
  public var autosavesConfiguration = true
  public var displayMode = "iconOnly"
  public var toolbarStyle = "unified"
  public var toolbarVisible = true

  private let onContentInsetChange = EventDispatcher()
  private var lastContentInset: CGFloat = -1
  private var resizeObserver: NSObjectProtocol?

  private let onSearchChange = EventDispatcher()
  private let onItemPress = EventDispatcher()
  private let onMenuItemPress = EventDispatcher()
  private let onSegmentChange = EventDispatcher()

  private weak var installedWindow: NSWindow?
  private var installedToolbar: NSToolbar?
  private var installedConfiguration: NSDictionary?
  private weak var glassBackgroundView: NSVisualEffectView?
  private weak var glassTintView: NSView?
  private var itemByIdentifier: [NSToolbarItem.Identifier: ToolbarItemRecord] = [:]
  private var identifierByItemId: [String: NSToolbarItem.Identifier] = [:]
  private var segmentItemIdByGroup: [ObjectIdentifier: String] = [:]

  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isHidden = true
  }

  deinit {
    detachToolbar()
  }

  public override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()

    guard window != nil else {
      detachToolbar()
      return
    }

    applyConfiguration()
  }

  public func applyConfiguration() {
    guard let window else {
      return
    }

    let configuration: NSDictionary = [
      "identifier": toolbarIdentifier,
      "items": items.map { item in
        var definition = item.toDictionary()
        if item.kind == "search" { definition.removeValue(forKey: "value") }
        return definition
      },
      "customizable": customizable,
      "autosavesConfiguration": autosavesConfiguration,
      "displayMode": displayMode,
      "toolbarStyle": toolbarStyle,
      "visible": toolbarVisible,
    ]
    if installedWindow === window, let toolbar = installedToolbar,
       installedConfiguration == configuration {
      for item in toolbar.items {
        guard let field = (item as? NSSearchToolbarItem)?.searchField,
              let definition = items.first(where: { $0.id == field.identifier?.rawValue }),
              field.currentEditor() == nil else { continue }
        if field.stringValue != definition.value { field.stringValue = definition.value }
      }
      return
    }

    let focusedSearch = installedToolbar?.items.compactMap { ($0 as? NSSearchToolbarItem)?.searchField }
      .first { $0.currentEditor() != nil }
    let focusedId = focusedSearch?.identifier
    let selection = focusedSearch?.currentEditor()?.selectedRange

    rebuildIdentifierMaps()

    if installedWindow !== window || installedToolbar?.identifier != toolbarIdentifier {
      detachToolbar()
    }

    let toolbar = makeToolbar()
    installedWindow = window
    installedToolbar = toolbar
    installedConfiguration = configuration
    installGlassBackground(in: window)
    window.toolbarStyle = resolvedToolbarStyle
    window.toolbar = toolbar
    if resizeObserver == nil {
      resizeObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResizeNotification, object: window, queue: .main) { [weak self] _ in
        self?.reportContentInset()
      }
    }
    DispatchQueue.main.async { [weak self] in self?.reportContentInset() }
    if let focusedId {
      DispatchQueue.main.async { [weak self, weak window, weak toolbar] in
        guard let self, let window, let toolbar, self.installedToolbar === toolbar,
              let field = toolbar.items.compactMap({ ($0 as? NSSearchToolbarItem)?.searchField })
                .first(where: { $0.identifier == focusedId }) else { return }
        window.makeFirstResponder(field)
        if let selection { field.currentEditor()?.selectedRange = selection }
      }
    }
  }

  private func reportContentInset() {
    guard let window = installedWindow, let contentView = window.contentView else { return }
    let inset = max(0, contentView.bounds.height - window.contentLayoutRect.height)
    guard inset != lastContentInset else { return }
    lastContentInset = inset
    onContentInsetChange(["top": inset])
  }

  private func installGlassBackground(in window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titlebarSeparatorStyle = .none
    window.isOpaque = false
    window.backgroundColor = .clear
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.hasShadow = true

    guard let contentView = window.contentView else {
      return
    }

    if glassBackgroundView?.superview !== contentView {
      glassBackgroundView?.removeFromSuperview()
      let effectView = NSVisualEffectView(frame: contentView.bounds)
      effectView.autoresizingMask = [.width, .height]
      effectView.blendingMode = .behindWindow
      effectView.material = .underWindowBackground
      effectView.state = .active

      let tintView = NSView(frame: effectView.bounds)
      tintView.autoresizingMask = [.width, .height]
      tintView.wantsLayer = true
      tintView.layer?.backgroundColor = NSColor(
        red: 227 / 255,
        green: 234 / 255,
        blue: 240 / 255,
        alpha: 0.2
      ).cgColor
      effectView.addSubview(tintView)

      contentView.addSubview(effectView, positioned: .below, relativeTo: nil)
      glassBackgroundView = effectView
      glassTintView = tintView
    }

    glassTintView?.isHidden = window.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
  }

  public func showCustomizationPalette() {
    guard customizable else {
      return
    }
    installedToolbar?.runCustomizationPalette(nil)
  }

  public func resetConfiguration() {
    guard let toolbar = installedToolbar else {
      return
    }

    if #available(macOS 15.0, *) {
      toolbar.itemIdentifiers = defaultItemIdentifiers
    } else {
      while !toolbar.items.isEmpty {
        toolbar.removeItem(at: toolbar.items.count - 1)
      }
      for (index, identifier) in defaultItemIdentifiers.enumerated() {
        toolbar.insertItem(withItemIdentifier: identifier, at: index)
      }
    }
  }

  public func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    defaultItemIdentifiers
  }

  public func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    allowedItemIdentifiers
  }

  public func toolbarImmovableItemIdentifiers(
    _ toolbar: NSToolbar
  ) -> Set<NSToolbarItem.Identifier> {
    Set(items.filter(\.immovable).compactMap { identifierByItemId[$0.id] })
  }

  public func toolbar(
    _ toolbar: NSToolbar,
    itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
    willBeInsertedIntoToolbar flag: Bool
  ) -> NSToolbarItem? {
    guard let definition = itemByIdentifier[itemIdentifier] else {
      return nil
    }

    switch definition.kind {
    case "search":
      return makeSearchItem(definition: definition, identifier: itemIdentifier)
    case "menu":
      return makeMenuItem(definition: definition, identifier: itemIdentifier)
    case "progress":
      return makeProgressItem(definition: definition, identifier: itemIdentifier)
    case "segmented":
      return makeSegmentedItem(definition: definition, identifier: itemIdentifier)
    case "space", "flexibleSpace":
      // AppKit automatically constructs its standard spacing items.
      return nil
    default:
      return makeButtonItem(definition: definition, identifier: itemIdentifier)
    }
  }

  @objc private func handleToolbarItem(_ sender: NSToolbarItem) {
    guard let definition = itemByIdentifier[sender.itemIdentifier] else {
      return
    }

    onItemPress(["id": definition.id])
  }

  @objc private func handleBadgeButton(_ sender: NSButton) {
    guard let itemId = sender.identifier?.rawValue,
          items.contains(where: { $0.id == itemId }) else {
      return
    }
    onItemPress(["id": itemId])
  }

  @objc private func handleMenuItem(_ sender: NSMenuItem) {
    guard let payload = sender.representedObject as? [String: String],
          let itemId = payload["itemId"],
          let optionId = payload["optionId"] else {
      return
    }
    onMenuItemPress(["id": itemId, "optionId": optionId])
  }

  @objc private func handleSegmentedItem(_ sender: NSToolbarItemGroup) {
    guard let itemId = segmentItemIdByGroup[ObjectIdentifier(sender)],
          let definition = items.first(where: { $0.id == itemId }),
          definition.segments.indices.contains(sender.selectedIndex) else {
      return
    }

    let segment = definition.segments[sender.selectedIndex]
    onSegmentChange([
      "id": itemId,
      "segmentId": segment.id,
      "selectedIndex": sender.selectedIndex,
    ])
  }

  private var defaultItemIdentifiers: [NSToolbarItem.Identifier] {
    items.compactMap { identifierByItemId[$0.id] }
  }

  private var allowedItemIdentifiers: [NSToolbarItem.Identifier] {
    Array(Set(defaultItemIdentifiers)).sorted { $0.rawValue < $1.rawValue }
  }

  private var resolvedDisplayMode: NSToolbar.DisplayMode {
    switch displayMode {
    case "labelOnly":
      return .labelOnly
    case "iconAndLabel":
      return .iconAndLabel
    case "default":
      return .default
    default:
      return .iconOnly
    }
  }

  private var resolvedToolbarStyle: NSWindow.ToolbarStyle {
    switch toolbarStyle {
    case "automatic":
      return .automatic
    case "expanded":
      return .expanded
    case "preference":
      return .preference
    case "unifiedCompact":
      return .unifiedCompact
    default:
      return .unified
    }
  }

  private func makeToolbar() -> NSToolbar {
    let toolbar = NSToolbar(identifier: NSToolbar.Identifier(toolbarIdentifier))
    toolbar.delegate = self
    toolbar.displayMode = resolvedDisplayMode
    toolbar.allowsUserCustomization = customizable
    toolbar.autosavesConfiguration = customizable && autosavesConfiguration
    toolbar.isVisible = toolbarVisible
    return toolbar
  }

  private func rebuildIdentifierMaps() {
    itemByIdentifier.removeAll()
    identifierByItemId.removeAll()

    for item in items where !item.id.isEmpty {
      let identifier = nativeIdentifier(for: item)
      itemByIdentifier[identifier] = item
      identifierByItemId[item.id] = identifier
    }
  }

  private func nativeIdentifier(for item: ToolbarItemRecord) -> NSToolbarItem.Identifier {
    switch item.kind {
    case "space":
      return .space
    case "flexibleSpace":
      return .flexibleSpace
    default:
      return NSToolbarItem.Identifier("\(toolbarIdentifier).\(item.id)")
    }
  }

  public func controlTextDidChange(_ notification: Notification) {
    guard let field = notification.object as? NSSearchField,
          let id = field.identifier?.rawValue else { return }
    onSearchChange(["id": id, "text": field.stringValue])
  }

  private func makeSearchItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSSearchToolbarItem(itemIdentifier: identifier)
    let field = item.searchField
    field.identifier = NSUserInterfaceItemIdentifier(definition.id)
    field.stringValue = definition.value
    field.placeholderString = definition.placeholder
    field.delegate = self
    field.sendsSearchStringImmediately = true
    field.setAccessibilityLabel(definition.label ?? "Search")
    item.preferredWidthForSearchField = 260
    configure(item, from: definition, includeImage: false)
    return item
  }

  private func makeButtonItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    if let count = definition.badgeCount, count > 0 {
      return makeBadgeButtonItem(
        definition: definition,
        identifier: identifier
      )
    }

    let item = NSToolbarItem(itemIdentifier: identifier)
    configure(item, from: definition)
    item.target = self
    item.action = #selector(handleToolbarItem(_:))
    return item
  }

  private func makeBadgeButtonItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSToolbarItem(itemIdentifier: identifier)
    let label = definition.label ?? definition.id
    let count = max(0, definition.badgeCount ?? 0)
    let button = NSButton()

    button.identifier = NSUserInterfaceItemIdentifier(definition.id)
    button.title = count > 0 ? count.formatted() : ""
    button.image = definition.systemImage.flatMap {
      NSImage(systemSymbolName: $0, accessibilityDescription: label)
    }
    button.imagePosition = count > 0 ? .imageLeading : .imageOnly
    button.imageScaling = .scaleProportionallyDown
    button.font = .monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
    button.bezelStyle = .texturedRounded
    button.isBordered = true
    button.contentTintColor = count > 0 ? .controlAccentColor : .controlTextColor
    button.toolTip = definition.toolTip
    button.isEnabled = definition.enabled
    button.target = self
    button.action = #selector(handleBadgeButton(_:))
    button.setAccessibilityLabel(label)
    button.setAccessibilityValue(
      count == 1 ? "1 new sender" : "\(count) new senders"
    )

    item.view = button
    configure(item, from: definition, includeImage: false)
    return item
  }

  private func makeMenuItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSMenuToolbarItem(itemIdentifier: identifier)
    let menu = NSMenu(title: definition.label ?? "")

    for option in definition.options {
      let menuItem = NSMenuItem(
        title: option.label,
        action: #selector(handleMenuItem(_:)),
        keyEquivalent: ""
      )
      menuItem.target = self
      menuItem.isEnabled = option.enabled
      menuItem.state = resolvedMenuState(option.state)
      menuItem.representedObject = ["itemId": definition.id, "optionId": option.id]
      if let symbolName = option.systemImage {
        menuItem.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: option.label)
      }
      menu.addItem(menuItem)
    }

    item.menu = menu
    configure(item, from: definition, defaultLabel: "Menu")
    return item
  }

  private func makeProgressItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSToolbarItem(itemIdentifier: identifier)
    let indicator: NSView
    if definition.indeterminate {
      let spinner = NSProgressIndicator(
        frame: NSRect(x: 0, y: 0, width: 18, height: 18)
      )
      spinner.style = .spinning
      spinner.controlSize = .small
      spinner.isIndeterminate = true
      // Non-interactive indicator: never draw a keyboard focus outline.
      spinner.focusRingType = .none
      spinner.startAnimation(nil)
      indicator = spinner
    } else {
      let ring = ToolbarProgressRing(
        frame: NSRect(x: 0, y: 0, width: 18, height: 18)
      )
      ring.progress = min(max(definition.progress, 0), 1)
      // Keep VoiceOver progress announcements, but never draw a keyboard
      // focus outline around this non-interactive indicator.
      ring.focusRingType = .none
      ring.setAccessibilityElement(true)
      ring.setAccessibilityRole(.progressIndicator)
      ring.setAccessibilityValue(ring.progress)
      ring.setAccessibilityMinValue(0)
      ring.setAccessibilityMaxValue(1)
      indicator = ring
    }
    let container = NSView(frame: NSRect(x: 0, y: 0, width: 36, height: 36))
    container.focusRingType = .none
    container.translatesAutoresizingMaskIntoConstraints = false
    indicator.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(indicator)
    NSLayoutConstraint.activate([
      indicator.centerXAnchor.constraint(equalTo: container.centerXAnchor),
      indicator.centerYAnchor.constraint(equalTo: container.centerYAnchor),
      indicator.widthAnchor.constraint(equalToConstant: 18),
      indicator.heightAnchor.constraint(equalToConstant: 18)
    ])
    let itemView: NSView
    if #available(macOS 26.0, *) {
      let glass = NSGlassEffectView(frame: container.bounds)
      glass.translatesAutoresizingMaskIntoConstraints = false
      glass.cornerRadius = 18
      glass.focusRingType = .none
      glass.contentView = container
      itemView = glass
    } else {
      itemView = container
    }
    item.view = itemView
    // Pin the item to its designed 36pt circle. The previous explicit size
    // anchors conflicted with the views' autoresizing masks, producing
    // unsatisfiable constraints that let the toolbar stretch the pill.
    item.minSize = NSSize(width: 36, height: 36)
    item.maxSize = NSSize(width: 36, height: 36)
    indicator.setAccessibilityLabel(definition.label ?? "Progress")
    configure(item, from: definition, defaultLabel: "Progress", includeImage: false)
    return item
  }

  private func makeSegmentedItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let labels = definition.segments.map { $0.label ?? $0.id }
    let hasOnlyImages = definition.segments.allSatisfy {
      $0.systemImage != nil || $0.imageData != nil || $0.fallbackText != nil
    }
    let item: NSToolbarItemGroup

    if hasOnlyImages {
      let images = definition.segments.map { segment in
        segmentImage(segment)
      }
      item = NSToolbarItemGroup(
        itemIdentifier: identifier,
        images: images,
        selectionMode: resolvedSelectionMode(definition.selectionMode),
        labels: labels,
        target: self,
        action: #selector(handleSegmentedItem(_:))
      )
    } else {
      item = NSToolbarItemGroup(
        itemIdentifier: identifier,
        titles: labels,
        selectionMode: resolvedSelectionMode(definition.selectionMode),
        labels: labels,
        target: self,
        action: #selector(handleSegmentedItem(_:))
      )
    }

    configure(item, from: definition, defaultLabel: "View")
    if definition.segments.indices.contains(definition.selectedIndex) {
      item.selectedIndex = definition.selectedIndex
    }
    segmentItemIdByGroup[ObjectIdentifier(item)] = definition.id
    return item
  }

  private func segmentImage(_ segment: ToolbarSegmentRecord) -> NSImage {
    let accessibilityLabel = segment.label ?? segment.id
    if let encoded = segment.imageData,
       let data = Data(base64Encoded: encoded),
       let source = NSImage(data: data) {
      return circularAvatar(source, accessibilityLabel: accessibilityLabel)
    }
    if let symbolName = segment.systemImage,
       let symbol = NSImage(
         systemSymbolName: symbolName,
         accessibilityDescription: accessibilityLabel
       ) {
      return symbol
    }

    let initials = String((segment.fallbackText ?? "?").prefix(2)).uppercased()
    let size = NSSize(width: 18, height: 18)
    let image = NSImage(size: size)
    image.lockFocus()
    NSColor.controlAccentColor.setFill()
    NSBezierPath(ovalIn: NSRect(origin: .zero, size: size)).fill()
    let attributes: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: initials.count > 1 ? 7 : 9, weight: .semibold),
      .foregroundColor: NSColor.white,
    ]
    let textSize = initials.size(withAttributes: attributes)
    initials.draw(
      at: NSPoint(x: (size.width - textSize.width) / 2, y: (size.height - textSize.height) / 2),
      withAttributes: attributes
    )
    image.unlockFocus()
    image.accessibilityDescription = accessibilityLabel
    return image
  }

  private func circularAvatar(_ source: NSImage, accessibilityLabel: String) -> NSImage {
    let size = NSSize(width: 18, height: 18)
    let image = NSImage(size: size)
    image.lockFocus()
    let path = NSBezierPath(ovalIn: NSRect(origin: .zero, size: size))
    path.addClip()
    source.draw(
      in: NSRect(origin: .zero, size: size),
      from: .zero,
      operation: .sourceOver,
      fraction: 1
    )
    image.unlockFocus()
    image.accessibilityDescription = accessibilityLabel
    return image
  }

  private func configure(
    _ item: NSToolbarItem,
    from definition: ToolbarItemRecord,
    defaultLabel: String? = nil,
    defaultSymbol: String? = nil,
    includeImage: Bool = true
  ) {
    let label = definition.label ?? defaultLabel ?? definition.id
    item.label = label
    item.paletteLabel = definition.paletteLabel ?? label
    item.toolTip = definition.toolTip
    item.isEnabled = definition.enabled
    item.isNavigational = definition.navigational

    if includeImage, let symbolName = definition.systemImage ?? defaultSymbol {
      item.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: label)
    }
  }

  private func resolvedMenuState(_ state: String) -> NSControl.StateValue {
    switch state {
    case "on":
      return .on
    case "mixed":
      return .mixed
    default:
      return .off
    }
  }

  private func resolvedSelectionMode(_ mode: String) -> NSToolbarItemGroup.SelectionMode {
    switch mode {
    case "selectOne":
      return .selectOne
    case "selectAny":
      return .selectAny
    default:
      return .momentary
    }
  }

  private func detachToolbar() {
    if let resizeObserver { NotificationCenter.default.removeObserver(resizeObserver) }
    resizeObserver = nil
    lastContentInset = -1
    if installedWindow?.toolbar === installedToolbar {
      installedWindow?.toolbar = nil
    }
    installedToolbar?.delegate = nil
    installedToolbar = nil
    installedWindow = nil
    segmentItemIdByGroup.removeAll()
  }
}
