import AppKit
import ExpoModulesCore

public struct ToolbarMenuOptionRecord: Record {
  @Field public var id: String = ""
  @Field public var label: String = ""
  @Field public var systemImage: String?
  @Field public var enabled: Bool = true
  @Field public var state: String = "off"

  public init() {}
}

public struct ToolbarSegmentRecord: Record {
  @Field public var id: String = ""
  @Field public var label: String?
  @Field public var systemImage: String?
  @Field public var imageData: String?
  @Field public var fallbackText: String?

  public init() {}
}

public struct ToolbarItemRecord: Record {
  @Field public var id: String = ""
  @Field public var kind: String = "button"
  @Field public var label: String?
  @Field public var paletteLabel: String?
  @Field public var toolTip: String?
  @Field public var systemImage: String?
  @Field public var enabled: Bool = true
  @Field public var selectable: Bool = false
  @Field public var immovable: Bool = false
  @Field public var navigational: Bool = false
  @Field public var placeholder: String?
  @Field public var value: String?
  @Field public var preferredWidth: Double = 240
  @Field public var options: [ToolbarMenuOptionRecord] = []
  @Field public var segments: [ToolbarSegmentRecord] = []
  @Field public var selectedIndex: Int = -1
  @Field public var selectionMode: String = "momentary"

  public init() {}
}

public final class NativeWindowToolbarView: ExpoView, NSToolbarDelegate, NSSearchFieldDelegate {
  public var toolbarIdentifier = "ExpoWindowToolbar"
  public var items: [ToolbarItemRecord] = []
  public var customizable = true
  public var autosavesConfiguration = true
  public var displayMode = "iconOnly"
  public var toolbarStyle = "unified"
  public var toolbarVisible = true
  public var centeredItemIds: [String] = []

  private let onItemPress = EventDispatcher()
  private let onSearchChange = EventDispatcher()
  private let onMenuItemPress = EventDispatcher()
  private let onSegmentChange = EventDispatcher()
  private let onConfigurationChange = EventDispatcher()

  private weak var installedWindow: NSWindow?
  private var installedToolbar: NSToolbar?
  private var itemByIdentifier: [NSToolbarItem.Identifier: ToolbarItemRecord] = [:]
  private var identifierByItemId: [String: NSToolbarItem.Identifier] = [:]
  private var searchItemIdByField: [ObjectIdentifier: String] = [:]
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

    rebuildIdentifierMaps()

    if installedWindow !== window || installedToolbar?.identifier != toolbarIdentifier {
      detachToolbar()
    }

    let toolbar = makeToolbar()
    installedWindow = window
    installedToolbar = toolbar
    window.toolbarStyle = resolvedToolbarStyle
    window.toolbar = toolbar
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
    emitConfigurationChange()
  }

  public func focusSearch(itemId: String) {
    guard let identifier = identifierByItemId[itemId],
          let item = installedToolbar?.items.first(where: { $0.itemIdentifier == identifier })
            as? NSSearchToolbarItem else {
      return
    }
    item.beginSearchInteraction()
  }

  public func setItemEnabled(itemId: String, enabled: Bool) {
    guard let identifier = identifierByItemId[itemId] else {
      return
    }
    installedToolbar?.items
      .filter { $0.itemIdentifier == identifier }
      .forEach { $0.isEnabled = enabled }
  }

  public func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    defaultItemIdentifiers
  }

  public func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    allowedItemIdentifiers
  }

  public func toolbarSelectableItemIdentifiers(
    _ toolbar: NSToolbar
  ) -> [NSToolbarItem.Identifier] {
    items.filter(\.selectable).compactMap { identifierByItemId[$0.id] }
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
    case "toggleSidebar":
      return makeSidebarItem(definition: definition, identifier: itemIdentifier)
    case "search":
      return makeSearchItem(definition: definition, identifier: itemIdentifier)
    case "menu":
      return makeMenuItem(definition: definition, identifier: itemIdentifier)
    case "segmented":
      return makeSegmentedItem(definition: definition, identifier: itemIdentifier)
    case "sidebarTrackingSeparator":
      return makeTrackingSeparatorItem(identifier: itemIdentifier)
    case "space", "flexibleSpace":
      // AppKit automatically constructs its standard spacing items.
      return nil
    default:
      return makeButtonItem(definition: definition, identifier: itemIdentifier)
    }
  }

  public func toolbarWillAddItem(_ notification: Notification) {
    dispatchConfigurationChangeAfterToolbarUpdate()
  }

  public func toolbarDidRemoveItem(_ notification: Notification) {
    dispatchConfigurationChangeAfterToolbarUpdate()
  }

  public func controlTextDidChange(_ notification: Notification) {
    guard let searchField = notification.object as? NSSearchField,
          let itemId = searchItemIdByField[ObjectIdentifier(searchField)] else {
      return
    }
    onSearchChange(["id": itemId, "value": searchField.stringValue])
  }

  @objc private func handleToolbarItem(_ sender: NSToolbarItem) {
    guard let definition = itemByIdentifier[sender.itemIdentifier] else {
      return
    }

    if definition.kind == "toggleSidebar" {
      findSplitViewController(in: installedWindow?.contentViewController)?.toggleSidebar(nil)
    }

    onItemPress(["id": definition.id])
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
    toolbar.centeredItemIdentifiers = Set(
      centeredItemIds.compactMap { identifierByItemId[$0] }
    )
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
    case "toggleSidebar":
      return .toggleSidebar
    case "space":
      return .space
    case "flexibleSpace":
      return .flexibleSpace
    default:
      return NSToolbarItem.Identifier("\(toolbarIdentifier).\(item.id)")
    }
  }

  private func makeButtonItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSToolbarItem(itemIdentifier: identifier)
    configure(item, from: definition)
    item.target = self
    item.action = #selector(handleToolbarItem(_:))
    return item
  }

  private func makeSidebarItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSToolbarItem(itemIdentifier: identifier)
    configure(item, from: definition, defaultLabel: "Sidebar", defaultSymbol: "sidebar.left")
    item.target = self
    item.action = #selector(handleToolbarItem(_:))
    return item
  }

  private func makeTrackingSeparatorItem(
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem? {
    guard let splitView = findSplitViewController(
      in: installedWindow?.contentViewController
    )?.splitView else {
      return nil
    }
    return NSTrackingSeparatorToolbarItem(
      identifier: identifier,
      splitView: splitView,
      dividerIndex: 0
    )
  }

  private func makeSearchItem(
    definition: ToolbarItemRecord,
    identifier: NSToolbarItem.Identifier
  ) -> NSToolbarItem {
    let item = NSSearchToolbarItem(itemIdentifier: identifier)
    let searchField = NSSearchField()
    searchField.placeholderString = definition.placeholder ?? definition.label ?? "Search"
    searchField.stringValue = definition.value ?? ""
    searchField.delegate = self
    item.searchField = searchField
    item.preferredWidthForSearchField = CGFloat(max(definition.preferredWidth, 120))
    configure(item, from: definition, defaultLabel: "Search", includeImage: false)
    searchItemIdByField[ObjectIdentifier(searchField)] = definition.id
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

  private func findSplitViewController(in controller: NSViewController?) -> NSSplitViewController? {
    guard let controller else {
      return nil
    }
    if let splitController = controller as? NSSplitViewController {
      return splitController
    }
    for child in controller.children {
      if let splitController = findSplitViewController(in: child) {
        return splitController
      }
    }
    return nil
  }

  private func dispatchConfigurationChangeAfterToolbarUpdate() {
    DispatchQueue.main.async { [weak self] in
      self?.emitConfigurationChange()
    }
  }

  private func emitConfigurationChange() {
    guard let toolbar = installedToolbar else {
      return
    }
    let itemIds = toolbar.items.compactMap { item in
      itemByIdentifier[item.itemIdentifier]?.id
    }
    onConfigurationChange(["itemIds": itemIds])
  }

  private func detachToolbar() {
    if installedWindow?.toolbar === installedToolbar {
      installedWindow?.toolbar = nil
    }
    installedToolbar?.delegate = nil
    installedToolbar = nil
    installedWindow = nil
    searchItemIdByField.removeAll()
    segmentItemIdByGroup.removeAll()
  }
}
