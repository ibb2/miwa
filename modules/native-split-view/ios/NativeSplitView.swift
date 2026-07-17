import AppKit
import ExpoModulesCore

public final class NativeSplitView: ExpoView {
  private let splitView = NSSplitView()
  private let onDividerPositionsChange = EventDispatcher()
  private var needsInitialPaneLayout = true

  public var orientation = "horizontal" {
    didSet {
      splitView.isVertical = orientation != "vertical"
      needsInitialPaneLayout = true
      setNeedsLayout()
    }
  }

  public var dividerStyle = "thin" {
    didSet {
      switch dividerStyle {
      case "paneSplitter":
        splitView.dividerStyle = .paneSplitter
      case "thick":
        splitView.dividerStyle = .thick
      default:
        splitView.dividerStyle = .thin
      }
    }
  }

  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    splitView.isVertical = true
    splitView.dividerStyle = .thin
    splitView.autoresizingMask = [.width, .height]
    addSubview(splitView)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(splitViewDidResize),
      name: NSSplitView.didResizeSubviewsNotification,
      object: splitView
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    splitView.frame = bounds

    if needsInitialPaneLayout {
      distributePanesEqually()
      needsInitialPaneLayout = false
    }
  }

  public func setDividerPosition(_ position: CGFloat, dividerIndex: Int) {
    guard dividerIndex >= 0, dividerIndex < splitView.arrangedSubviews.count - 1 else {
      return
    }
    splitView.setPosition(position, ofDividerAt: dividerIndex)
  }

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    let safeIndex = min(max(index, 0), splitView.arrangedSubviews.count)
    splitView.insertArrangedSubview(childComponentView, at: safeIndex)
    needsInitialPaneLayout = true
    setNeedsLayout()
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    splitView.removeArrangedSubview(childComponentView)
    childComponentView.removeFromSuperview()
  }

  @objc private func splitViewDidResize() {
    var positions: [CGFloat] = []
    var position: CGFloat = 0

    for pane in splitView.arrangedSubviews.dropLast() {
      position += splitView.isVertical ? pane.frame.width : pane.frame.height
      positions.append(position)
      position += splitView.dividerThickness
    }

    onDividerPositionsChange(["positions": positions])
  }

  private func distributePanesEqually() {
    let paneCount = splitView.arrangedSubviews.count
    guard paneCount > 1 else {
      return
    }

    let totalLength = splitView.isVertical ? splitView.bounds.width : splitView.bounds.height
    let availableLength = totalLength - splitView.dividerThickness * CGFloat(paneCount - 1)
    let paneLength = max(availableLength / CGFloat(paneCount), 0)

    for dividerIndex in 0..<(paneCount - 1) {
      let position = paneLength * CGFloat(dividerIndex + 1)
        + splitView.dividerThickness * CGFloat(dividerIndex)
      splitView.setPosition(position, ofDividerAt: dividerIndex)
    }
  }
}
