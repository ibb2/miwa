import AppKit
import ExpoModulesCore

public final class NativeThreadRowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeThreadRow")

    View(NativeThreadRowView.self) {
      ViewName("NativeThreadRow")

      Events("onRowPress", "onRowAction")

      Prop("rowKey") { (view: NativeThreadRowView, rowKey: String) in
        view.rowKey = rowKey
      }

      Prop("sender") { (view: NativeThreadRowView, sender: String) in
        view.sender = sender
      }

      Prop("subject") { (view: NativeThreadRowView, subject: String) in
        view.subject = subject
      }

      Prop("preview") { (view: NativeThreadRowView, preview: String) in
        view.preview = preview
      }

      Prop("dateText") { (view: NativeThreadRowView, dateText: String) in
        view.dateText = dateText
      }

      Prop("messageCount") { (view: NativeThreadRowView, messageCount: Int) in
        view.messageCount = messageCount
      }

      Prop("unread") { (view: NativeThreadRowView, unread: Bool) in
        view.unread = unread
      }

      Prop("done") { (view: NativeThreadRowView, done: Bool) in
        view.done = done
      }

      Prop("pinned") { (view: NativeThreadRowView, pinned: Bool) in
        view.pinned = pinned
      }

      Prop("hasAttachments") { (view: NativeThreadRowView, hasAttachments: Bool) in
        view.hasAttachments = hasAttachments
      }

      Prop("showPreview") { (view: NativeThreadRowView, showPreview: Bool) in
        view.showPreview = showPreview
      }

      Prop("compact") { (view: NativeThreadRowView, compact: Bool) in
        view.compact = compact
      }

      Prop("accentHex") { (view: NativeThreadRowView, accentHex: String) in
        view.accentHex = accentHex
      }

      OnViewDidUpdateProps { view in
        view.refresh()
      }
    }
  }
}

public final class NativeThreadRowView: ExpoView {
  public var rowKey = ""
  public var sender = ""
  public var subject = ""
  public var preview = ""
  public var dateText = ""
  public var messageCount = 0
  public var unread = false
  public var done = false
  public var pinned = false
  public var hasAttachments = false
  public var showPreview = true
  public var compact = false
  public var accentHex = ""

  let onRowPress = EventDispatcher()
  let onRowAction = EventDispatcher()

  private var appliedRowKey: String?
  private var hovered = false
  private var pressed = false
  private var trackingArea: NSTrackingArea?
  // The pointer has one hover owner, even while LegendList moves and recycles rows.
  private static weak var hoveredRow: NativeThreadRowView?
  private static var scrollSuppressUntil: TimeInterval = 0
  private static var unsuppressWork: DispatchWorkItem?

  private let dotView = NSView()
  private let senderField = NativeThreadRowView.makeLabel(
    font: .systemFont(ofSize: 13), color: .labelColor, alignment: .left)
  private let countField = NativeThreadRowView.makeLabel(
    font: .systemFont(ofSize: 11), color: .secondaryLabelColor, alignment: .left)
  private let attachmentView = NSImageView()
  private let subjectField = NativeThreadRowView.makeLabel(
    font: .systemFont(ofSize: 13), color: .labelColor, alignment: .left)
  private let previewField = NativeThreadRowView.makeLabel(
    font: .systemFont(ofSize: 12), color: .secondaryLabelColor, alignment: .left)
  private let dateField = NativeThreadRowView.makeLabel(
    font: .monospacedDigitSystemFont(ofSize: 12, weight: .regular),
    color: .secondaryLabelColor, alignment: .right)

  private let doneButton = NativeThreadRowView.makeButton()
  private let readButton = NativeThreadRowView.makeButton()
  private let archiveButton = NativeThreadRowView.makeButton()
  private let pinButton = NativeThreadRowView.makeButton()

  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    wantsLayer = true
    layer?.cornerRadius = 12
    layer?.masksToBounds = true
    layer?.cornerCurve = .continuous

    dotView.wantsLayer = true
    dotView.layer?.cornerRadius = 3.5
    addSubview(dotView)

    addSubview(senderField)
    addSubview(countField)

    attachmentView.imageScaling = .scaleProportionallyDown
    attachmentView.contentTintColor = .secondaryLabelColor
    addSubview(attachmentView)

    addSubview(subjectField)
    addSubview(previewField)
    addSubview(dateField)

    doneButton.target = self
    doneButton.action = #selector(handleDone(_:))
    addSubview(doneButton)

    readButton.target = self
    readButton.action = #selector(handleRead(_:))
    addSubview(readButton)

    archiveButton.target = self
    archiveButton.action = #selector(handleArchive(_:))
    addSubview(archiveButton)

    pinButton.target = self
    pinButton.action = #selector(handlePin(_:))
    addSubview(pinButton)

    setAccessibilityElement(true)
    setAccessibilityRole(.button)
  }

  override public var isFlipped: Bool { true }

  public override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let trackingArea {
      removeTrackingArea(trackingArea)
    }
    let area = NSTrackingArea(
      rect: bounds,
      options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(area)
    trackingArea = area
    updateHoverFromMouseLocation()
  }

  public override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window == nil {
      setHovered(false)
    }
  }

  public override func layout() {
    super.layout()
    layoutRow()
  }

  public func refresh() {
    if appliedRowKey != rowKey {
      appliedRowKey = rowKey
      setHovered(false)
    }

    let accent = resolvedAccent()

    senderField.stringValue = sender
    senderField.font = .systemFont(ofSize: 13, weight: unread ? .bold : .regular)
    senderField.textColor = .labelColor

    countField.stringValue = messageCount > 1 ? "\(messageCount)" : ""
    countField.font = .systemFont(ofSize: 11, weight: .regular)
    countField.textColor = .secondaryLabelColor
    countField.isHidden = messageCount <= 1

    if hasAttachments {
      attachmentView.image = NSImage(
        systemSymbolName: "paperclip", accessibilityDescription: "Has attachment")
      attachmentView.contentTintColor = .secondaryLabelColor
    } else {
      attachmentView.image = nil
    }
    attachmentView.isHidden = !hasAttachments

    subjectField.stringValue = subject
    subjectField.font = .systemFont(ofSize: 13, weight: unread ? .bold : .regular)
    subjectField.textColor = .labelColor

    previewField.stringValue = preview
    previewField.font = .systemFont(ofSize: 12, weight: .regular)
    previewField.textColor = .secondaryLabelColor
    previewField.isHidden = !showsPreviewText()

    dateField.stringValue = dateText
    dateField.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
    dateField.textColor = .secondaryLabelColor
    dateField.isHidden = hovered

    doneButton.image = NSImage(
      systemSymbolName: done ? "checkmark.circle.fill" : "checkmark",
      accessibilityDescription: done ? "Mark as not done" : "Mark as done")
    doneButton.contentTintColor = done ? accent : .secondaryLabelColor
    doneButton.toolTip = done ? "Mark as not done" : "Mark as done"
    doneButton.setAccessibilityLabel(done ? "Mark as not done" : "Mark as done")
    doneButton.isHidden = !hovered

    readButton.image = NSImage(
      systemSymbolName: unread ? "envelope.open" : "envelope.badge",
      accessibilityDescription: unread ? "Mark as read" : "Mark as unread")
    readButton.contentTintColor = .secondaryLabelColor
    readButton.toolTip = unread ? "Mark as read" : "Mark as unread"
    readButton.setAccessibilityLabel(unread ? "Mark as read" : "Mark as unread")
    readButton.isHidden = !hovered

    archiveButton.image = NSImage(
      systemSymbolName: "archivebox", accessibilityDescription: "Archive")
    archiveButton.contentTintColor = .secondaryLabelColor
    archiveButton.toolTip = "Archive"
    archiveButton.setAccessibilityLabel("Archive")
    archiveButton.isHidden = !hovered

    pinButton.image = NSImage(
      systemSymbolName: pinned ? "pin.fill" : "pin",
      accessibilityDescription: pinned ? "Unpin" : "Pin")
    pinButton.contentTintColor = pinned ? accent : .secondaryLabelColor
    pinButton.toolTip = pinned ? "Unpin" : "Pin"
    pinButton.setAccessibilityLabel(pinned ? "Unpin" : "Pin")
    pinButton.isHidden = !hovered

    let subjectLabel: String
    if subject.isEmpty || subject == "(No subject)" {
      subjectLabel = "No subject"
    } else {
      subjectLabel = subject
    }
    var label = "\(sender), \(subjectLabel)"
    if hasAttachments {
      label += ", has attachment"
    }
    setAccessibilityLabel(label)

    updateBackground()
    needsLayout = true
  }

  public override func mouseEntered(with event: NSEvent) {
    updateHoverFromMouseLocation()
  }

  public override func scrollWheel(with event: NSEvent) {
    suppressHoverForScroll()
    super.scrollWheel(with: event)
  }

  public override func mouseExited(with event: NSEvent) {
    updateHoverFromMouseLocation()
  }

  public override func mouseDown(with event: NSEvent) {
    pressed = true
    updateBackground()
  }

  public override func mouseUp(with event: NSEvent) {
    let wasPressed = pressed
    pressed = false
    updateBackground()
    guard wasPressed else { return }
    let location = convert(event.locationInWindow, from: nil)
    guard visibleRect.contains(location) else { return }
    guard !isInVisibleButton(location) else { return }
    onRowPress([:])
  }

  public override func resetCursorRects() {
    super.resetCursorRects()
    if hovered {
      addCursorRect(bounds, cursor: .pointingHand)
    }
  }

  @objc private func handleDone(_ sender: NSButton) {
    onRowAction(["action": "done"])
  }

  @objc private func handleRead(_ sender: NSButton) {
    onRowAction(["action": "read"])
  }

  @objc private func handleArchive(_ sender: NSButton) {
    onRowAction(["action": "archive"])
  }

  @objc private func handlePin(_ sender: NSButton) {
    onRowAction(["action": "pin"])
  }

  private func showsPreviewText() -> Bool {
    showPreview && !compact && !preview.isEmpty
  }

  private func suppressHoverForScroll() {
    Self.hoveredRow?.setHovered(false)
    setHovered(false)
    Self.scrollSuppressUntil = ProcessInfo.processInfo.systemUptime + 0.25
    Self.unsuppressWork?.cancel()
    let work = DispatchWorkItem { [weak window] in
      Self.unsuppressWork = nil
      guard let window else { return }
      Self.rowUnderMouse(in: window)?.updateHoverFromMouseLocation()
    }
    Self.unsuppressWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
  }

  private func updateHoverFromMouseLocation() {
    guard ProcessInfo.processInfo.systemUptime >= Self.scrollSuppressUntil,
      let window, NSApp.isActive,
      Self.rowUnderMouse(in: window) === self
    else {
      setHovered(false)
      return
    }
    setHovered(true)
  }

  private static func rowUnderMouse(in window: NSWindow) -> NativeThreadRowView? {
    guard let contentView = window.contentView,
      NSWindow.windowNumber(at: NSEvent.mouseLocation, belowWindowWithWindowNumber: 0)
        == window.windowNumber
    else { return nil }
    let point =
      contentView.superview?.convert(window.mouseLocationOutsideOfEventStream, from: nil)
      ?? window.mouseLocationOutsideOfEventStream
    var view = contentView.hitTest(point)
    while let current = view {
      if let row = current as? NativeThreadRowView {
        let location = row.convert(window.mouseLocationOutsideOfEventStream, from: nil)
        return row.visibleRect.contains(location) ? row : nil
      }
      view = current.superview
    }
    return nil
  }

  private func setHovered(_ value: Bool) {
    if value {
      if Self.hoveredRow !== self {
        Self.hoveredRow?.setHovered(false)
        Self.hoveredRow = self
      }
    } else if Self.hoveredRow === self {
      Self.hoveredRow = nil
    }
    guard hovered != value || (!value && pressed) else { return }
    hovered = value
    if !value { pressed = false }
    updateBackground()
    refreshVisibilityForHover()
    window?.invalidateCursorRects(for: self)
  }

  private func refreshVisibilityForHover() {
    dateField.isHidden = hovered
    doneButton.isHidden = !hovered
    readButton.isHidden = !hovered
    archiveButton.isHidden = !hovered
    pinButton.isHidden = !hovered
    needsLayout = true
  }

  private func updateBackground() {
    layer?.cornerRadius = 12
    layer?.masksToBounds = true
    layer?.cornerCurve = .continuous
    let color: NSColor
    if pressed {
      color = NSColor(white: 0.5, alpha: 0.18)
    } else if hovered {
      color = NSColor(white: 0.5, alpha: 0.10)
    } else {
      color = .clear
    }
    layer?.backgroundColor = color.cgColor
  }

  private func isInVisibleButton(_ point: NSPoint) -> Bool {
    guard hovered else { return false }
    for button in [doneButton, readButton, archiveButton, pinButton] {
      if !button.isHidden && button.frame.contains(point) {
        return true
      }
    }
    return false
  }

  private func layoutRow() {
    let width = bounds.width
    let height = bounds.height
    guard width > 0 && height > 0 else { return }

    let outer: CGFloat = 8
    let gap: CGFloat = 8
    let dotColumnWidth: CGFloat = 8
    let trailingWidth: CGFloat = 134

    let senderWidth = min(220, floor(width * 0.22))

    let dotX = outer
    dotView.frame = NSRect(
      x: dotX + (dotColumnWidth - 7) / 2,
      y: (height - 7) / 2,
      width: 7,
      height: 7
    )

    let senderX = dotX + dotColumnWidth + gap
    let trailingX = width - outer - trailingWidth
    let subjectX = senderX + senderWidth + gap
    let subjectWidth = max(0, trailingX - gap - subjectX)

    let hasCount = messageCount > 1
    let countWidth: CGFloat = hasCount ? 20 : 0
    let attachmentWidth: CGFloat = hasAttachments ? 18 : 0
    let inlineGap: CGFloat = 6
    var senderRemainder = senderWidth
    if hasCount {
      senderRemainder -= countWidth + inlineGap
    }
    if hasAttachments {
      senderRemainder -= attachmentWidth + inlineGap
    }
    let senderTextWidth = max(0, senderRemainder)
    let textHeight: CGFloat = 18
    let senderY = (height - textHeight) / 2
    senderField.frame = NSRect(x: senderX, y: senderY, width: senderTextWidth, height: textHeight)
    var cursorX = senderX + senderTextWidth
    if hasCount {
      cursorX += inlineGap
      countField.frame = NSRect(x: cursorX, y: senderY, width: countWidth, height: textHeight)
      cursorX += countWidth
    } else {
      countField.frame = .zero
    }
    if hasAttachments {
      cursorX += inlineGap
      attachmentView.frame = NSRect(x: cursorX, y: (height - 18) / 2, width: 18, height: 18)
    } else {
      attachmentView.frame = .zero
    }

    if showsPreviewText() {
      let innerGap: CGFloat = 8
      let subjectLimit = max(0, floor((subjectWidth - innerGap) * 0.7))
      let naturalSubjectWidth = (subjectField.stringValue as NSString).size(withAttributes: [
        .font: subjectField.font ?? NSFont.systemFont(ofSize: 13)
      ]).width
      let subjectAlloc = min(subjectLimit, ceil(naturalSubjectWidth) + 4)
      let previewAlloc = max(0, subjectWidth - subjectAlloc - innerGap)
      subjectField.frame = NSRect(x: subjectX, y: senderY, width: subjectAlloc, height: textHeight)
      previewField.frame = NSRect(
        x: subjectX + subjectAlloc + innerGap, y: senderY, width: previewAlloc, height: textHeight)
    } else {
      subjectField.frame = NSRect(x: subjectX, y: senderY, width: subjectWidth, height: textHeight)
      previewField.frame = .zero
    }

    let trailingY = (height - 34) / 2
    dateField.frame = NSRect(x: trailingX, y: (height - 22) / 2, width: trailingWidth, height: 22)

    let buttonHeight: CGFloat = 30
    let buttonY = trailingY + (34 - buttonHeight) / 2
    let buttonWidth: CGFloat = 32
    let buttonGap: CGFloat = 2
    doneButton.frame = NSRect(x: trailingX, y: buttonY, width: buttonWidth, height: buttonHeight)
    readButton.frame = NSRect(
      x: trailingX + (buttonWidth + buttonGap), y: buttonY, width: buttonWidth, height: buttonHeight
    )
    archiveButton.frame = NSRect(
      x: trailingX + (buttonWidth + buttonGap) * 2, y: buttonY, width: buttonWidth,
      height: buttonHeight)
    pinButton.frame = NSRect(
      x: trailingX + (buttonWidth + buttonGap) * 3, y: buttonY, width: buttonWidth,
      height: buttonHeight)
  }

  private func resolvedAccent() -> NSColor {
    if let color = NativeThreadRowView.color(fromHex: accentHex) {
      return color
    }
    return .controlAccentColor
  }

  private static func color(fromHex hex: String) -> NSColor? {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if cleaned.hasPrefix("#") {
      cleaned.removeFirst()
    }
    if cleaned.count == 3 {
      var expanded = ""
      for character in cleaned {
        expanded.append(character)
        expanded.append(character)
      }
      cleaned = expanded
    }
    guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
    let red = CGFloat((value >> 16) & 0xFF) / 255
    let green = CGFloat((value >> 8) & 0xFF) / 255
    let blue = CGFloat(value & 0xFF) / 255
    return NSColor(srgbRed: red, green: green, blue: blue, alpha: 1)
  }

  private static func makeLabel(font: NSFont, color: NSColor, alignment: NSTextAlignment)
    -> NSTextField
  {
    let field = NSTextField(labelWithString: "")
    field.isEditable = false
    field.isSelectable = false
    field.isBezeled = false
    field.drawsBackground = false
    field.backgroundColor = .clear
    field.lineBreakMode = .byTruncatingTail
    field.usesSingleLineMode = true
    field.cell?.truncatesLastVisibleLine = true
    field.cell?.lineBreakMode = .byTruncatingTail
    field.font = font
    field.textColor = color
    field.alignment = alignment
    return field
  }

  private static func makeButton() -> NSButton {
    let button = NSButton(frame: NSRect(x: 0, y: 0, width: 32, height: 30))
    button.isBordered = false
    button.bezelStyle = .regularSquare
    button.imagePosition = .imageOnly
    button.imageScaling = .scaleProportionallyDown
    return button
  }
}
