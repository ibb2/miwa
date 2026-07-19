import AppKit
import ExpoModulesCore

public final class NativeSplitView: ExpoView, NSToolbarDelegate {
  private static let toolbarIdentifier = NSToolbar.Identifier("MiwaWorkspaceToolbar")

  private let splitViewController = NSSplitViewController()
  private let onDividerPositionsChange = EventDispatcher()
  private var paneControllers: [ObjectIdentifier: NSViewController] = [:]
  private var needsInitialPaneLayout = true
  private weak var hostViewController: NSViewController?

  public var initialPaneSizes: [CGFloat] = [] {
    didSet {
      needsInitialPaneLayout = true
      setNeedsLayout()
    }
  }

  public var orientation = "horizontal" {
    didSet {
      splitViewController.splitView.isVertical = orientation != "vertical"
      needsInitialPaneLayout = true
      setNeedsLayout()
    }
  }

  public var dividerStyle = "thin" {
    didSet {
      switch dividerStyle {
      case "paneSplitter":
        splitViewController.splitView.dividerStyle = .paneSplitter
      case "thick":
        splitViewController.splitView.dividerStyle = .thick
      default:
        splitViewController.splitView.dividerStyle = .thin
      }
    }
  }

  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    splitViewController.splitView.isVertical = true
    splitViewController.splitView.dividerStyle = .thin
    splitViewController.splitView.autosaveName = "MiwaWorkspaceSplitView"
    splitViewController.minimumThicknessForInlineSidebars = 760
    splitViewController.view.autoresizingMask = [.width, .height]
    addSubview(splitViewController.view)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(splitViewDidResize),
      name: NSSplitView.didResizeSubviewsNotification,
      object: splitViewController.splitView
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    if window?.toolbar?.identifier == Self.toolbarIdentifier {
      window?.toolbar?.delegate = nil
    }
    splitViewController.removeFromParent()
  }

  public override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()

    guard let window else {
      splitViewController.removeFromParent()
      hostViewController = nil
      return
    }

    if let host = window.contentViewController,
       splitViewController.parent !== host {
      splitViewController.removeFromParent()
      host.addChild(splitViewController)
      hostViewController = host
    }

    configureWindow(window)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    splitViewController.view.frame = bounds

    if needsInitialPaneLayout {
      distributePanes()
      needsInitialPaneLayout = false
    }
  }

  public func setDividerPosition(_ position: CGFloat, dividerIndex: Int) {
    let splitView = splitViewController.splitView
    guard dividerIndex >= 0, dividerIndex < splitView.arrangedSubviews.count - 1 else {
      return
    }
    splitView.setPosition(position, ofDividerAt: dividerIndex)
  }

  public func toggleSidebar() {
    splitViewController.toggleSidebar(nil)
  }

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.autoresizingMask = [.width, .height]

    let paneController = NSViewController()
    paneController.view = childComponentView
    paneControllers[ObjectIdentifier(childComponentView)] = paneController

    let splitItem = makeSplitItem(for: paneController, index: index)
    let safeIndex = min(max(index, 0), splitViewController.splitViewItems.count)
    splitViewController.insertSplitViewItem(splitItem, at: safeIndex)

    needsInitialPaneLayout = true
    setNeedsLayout()
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    let identifier = ObjectIdentifier(childComponentView)
    guard let paneController = paneControllers.removeValue(forKey: identifier),
          let splitItem = splitViewController.splitViewItem(for: paneController) else {
      childComponentView.removeFromSuperview()
      return
    }

    splitViewController.removeSplitViewItem(splitItem)
    childComponentView.removeFromSuperview()
    needsInitialPaneLayout = true
    setNeedsLayout()
  }

  public func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    [.toggleSidebar, .flexibleSpace]
  }

  public func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    [.toggleSidebar, .flexibleSpace, .space]
  }

  public func toolbar(
    _ toolbar: NSToolbar,
    itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
    willBeInsertedIntoToolbar flag: Bool
  ) -> NSToolbarItem? {
    guard itemIdentifier == .toggleSidebar else {
      return nil
    }

    let item = NSToolbarItem(itemIdentifier: .toggleSidebar)
    item.label = "Toggle Sidebar"
    item.paletteLabel = "Toggle Sidebar"
    item.toolTip = "Show or hide the sidebar"
    item.target = splitViewController
    item.action = #selector(NSSplitViewController.toggleSidebar(_:))
    return item
  }

  @objc private func splitViewDidResize() {
    let splitView = splitViewController.splitView
    var positions: [CGFloat] = []
    var position: CGFloat = 0

    for pane in splitView.arrangedSubviews.dropLast() {
      position += splitView.isVertical ? pane.frame.width : pane.frame.height
      positions.append(position)
      position += splitView.dividerThickness
    }

    onDividerPositionsChange(["positions": positions])
  }

  private func makeSplitItem(
    for paneController: NSViewController,
    index: Int
  ) -> NSSplitViewItem {
    switch index {
    case 0:
      let item = NSSplitViewItem(sidebarWithViewController: paneController)
      item.allowsFullHeightLayout = true
      item.canCollapse = true
      item.canCollapseFromWindowResize = true
      item.collapseBehavior = .preferResizingSiblingsWithFixedSplitView
      item.minimumThickness = 180
      item.maximumThickness = 360
      item.titlebarSeparatorStyle = .none
      return item
    case 1:
      let item = NSSplitViewItem(contentListWithViewController: paneController)
      item.minimumThickness = 300
      item.titlebarSeparatorStyle = .line
      if #available(macOS 26.0, *) {
        item.automaticallyAdjustsSafeAreaInsets = true
      }
      return item
    default:
      let item = NSSplitViewItem(viewController: paneController)
      item.minimumThickness = 340
      item.titlebarSeparatorStyle = .line
      return item
    }
  }

  private func configureWindow(_ window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .none
    window.backgroundColor = .clear
    window.isOpaque = false

    guard window.toolbar?.identifier != Self.toolbarIdentifier else {
      return
    }

    let toolbar = NSToolbar(identifier: Self.toolbarIdentifier)
    toolbar.delegate = self
    toolbar.displayMode = .iconOnly
    toolbar.allowsUserCustomization = false
    toolbar.autosavesConfiguration = false
    window.toolbarStyle = .unified
    window.toolbar = toolbar
  }

  private func distributePanes() {
    let splitView = splitViewController.splitView
    let paneCount = splitView.arrangedSubviews.count
    guard paneCount > 1 else {
      return
    }

    let totalLength = splitView.isVertical ? splitView.bounds.width : splitView.bounds.height
    let availableLength = totalLength - splitView.dividerThickness * CGFloat(paneCount - 1)
    let minimumPaneLength: CGFloat = 120
    var allocatedLength: CGFloat = 0
    var remainingLength = max(availableLength, 0)

    for dividerIndex in 0..<(paneCount - 1) {
      let remainingPaneCount = paneCount - dividerIndex
      let fallbackLength = remainingLength / CGFloat(remainingPaneCount)
      let requestedLength = initialPaneSizes.indices.contains(dividerIndex)
        ? initialPaneSizes[dividerIndex]
        : fallbackLength
      let reservedLength = minimumPaneLength * CGFloat(remainingPaneCount - 1)
      let maximumLength = max(remainingLength - reservedLength, 0)
      let paneLength = min(max(requestedLength, minimumPaneLength), maximumLength)

      allocatedLength += paneLength
      remainingLength -= paneLength

      let position = allocatedLength
        + splitView.dividerThickness * CGFloat(dividerIndex)
      splitView.setPosition(position, ofDividerAt: dividerIndex)
    }
  }
}
