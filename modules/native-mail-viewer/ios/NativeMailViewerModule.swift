import AppKit
import ExpoModulesCore
import WebKit

public struct MailAttachmentExportRecord: Record {
  @Field public var filename: String = ""
  @Field public var dataBase64: String = ""

  public init() {}
}

public final class NativeMailViewerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeMailViewer")

    AsyncFunction("saveAttachment") { (attachment: MailAttachmentExportRecord) async throws -> String? in
      try await MainActor.run {
        let data = try decodedData(attachment)
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = safeFilename(attachment.filename)
        panel.prompt = "Save"

        guard panel.runModal() == .OK, let destination = panel.url else { return nil }
        try data.write(to: destination, options: .atomic)
        return destination.path
      }
    }

    AsyncFunction("saveAttachments") {
      (attachments: [MailAttachmentExportRecord]) async throws -> String? in
      try await MainActor.run {
        let files = try attachments.map { (safeFilename($0.filename), try decodedData($0)) }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose where to save \(files.count) attachments."

        guard panel.runModal() == .OK, let directory = panel.url else { return nil }
        var reserved = Set<String>()
        for (filename, data) in files {
          let destination = availableURL(
            in: directory,
            filename: filename,
            reserved: &reserved
          )
          try data.write(to: destination, options: .atomic)
        }
        return directory.path
      }
    }

    View(NativeMailViewerView.self) {
      ViewName("NativeMailViewer")
      Events("onContentHeightChange")

      Prop("html") { (view: NativeMailViewerView, html: String?) in
        view.html = html
      }

      Prop("allowRemoteImages") { (view: NativeMailViewerView, allowed: Bool) in
        view.allowRemoteImages = allowed
      }

      Prop("plainText") { (view: NativeMailViewerView, plainText: String) in
        view.plainText = plainText
      }

      OnViewDidUpdateProps { view in
        view.render()
      }
    }
  }
}

private func decodedData(_ attachment: MailAttachmentExportRecord) throws -> Data {
  guard let data = Data(base64Encoded: attachment.dataBase64) else {
    throw NSError(
      domain: "NativeMailViewer",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "The attachment data could not be read."]
    )
  }
  return data
}

private func safeFilename(_ filename: String) -> String {
  let name = URL(fileURLWithPath: filename).lastPathComponent
    .replacingOccurrences(of: ":", with: "-")
    .trimmingCharacters(in: .whitespacesAndNewlines)
  return name.isEmpty || name == "." || name == ".." ? "Attachment" : name
}

private func availableURL(
  in directory: URL,
  filename: String,
  reserved: inout Set<String>
) -> URL {
  let source = URL(fileURLWithPath: filename)
  let stem = source.deletingPathExtension().lastPathComponent
  let pathExtension = source.pathExtension
  var candidate = filename
  var suffix = 2

  while reserved.contains(candidate.lowercased()) ||
        FileManager.default.fileExists(atPath: directory.appendingPathComponent(candidate).path) {
    candidate = pathExtension.isEmpty
      ? "\(stem) \(suffix)"
      : "\(stem) \(suffix).\(pathExtension)"
    suffix += 1
  }
  reserved.insert(candidate.lowercased())
  return directory.appendingPathComponent(candidate)
}

public final class NativeMailViewerView: ExpoView, WKNavigationDelegate {
  public var allowRemoteImages = false
  private var renderedRemoteImages = false
  public var html: String?
  public var plainText = ""
  private let webView: WKWebView
  private let heightObserver = MailHeightObserver()
  private var renderedBody: String?
  let onContentHeightChange = EventDispatcher()

  required public init(appContext: AppContext? = nil) {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    webView = MailWebView(frame: .zero, configuration: configuration)
    super.init(appContext: appContext)

    webView.navigationDelegate = self
    webView.setValue(false, forKey: "drawsBackground")
    addSubview(webView)
    heightObserver.onHeight = { [weak self] height in
      self?.onContentHeightChange(["height": height])
    }
    configuration.userContentController.add(heightObserver, contentWorld: .defaultClient, name: "mailHeight")
    let measurementScript = """
    const content = document.getElementById('miwa-content');
    let lastHeight = 0;
    function reportHeight() {
      const height = Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height)) + 4;
      if (height !== lastHeight) {
        lastHeight = height;
        window.webkit.messageHandlers.mailHeight.postMessage(height);
      }
    }
    new ResizeObserver(reportHeight).observe(content);
    window.addEventListener('load', reportHeight);
    reportHeight();
    """
    configuration.userContentController.addUserScript(WKUserScript(
      source: measurementScript, injectionTime: .atDocumentEnd,
      forMainFrameOnly: true, in: .defaultClient
    ))

    let rules = """
    [{"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},{"trigger":{"url-filter":"^https?://.*","resource-type":["image"]},"action":{"type":"ignore-previous-rules"}}]
    """
    WKContentRuleListStore.default().compileContentRuleList(
      forIdentifier: "MiwaMailImagesOnly",
      encodedContentRuleList: rules
    ) { [weak self] list, _ in
      if let list { self?.webView.configuration.userContentController.add(list) }
    }
  }

  public override func layout() {
    super.layout()
    webView.frame = bounds
  }

  public func render() {
    let body: String
    if let html, !html.isEmpty {
      body = html
    } else {
      body = "<pre>\(escape(plainText))</pre>"
    }
    guard renderedBody != body || renderedRemoteImages != allowRemoteImages else { return }
    renderedBody = body
    renderedRemoteImages = allowRemoteImages
    let imageSources = allowRemoteImages ? "data: cid: https: http:" : "data: cid:"
    let document = """
    <!doctype html>
    <html><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src \(imageSources); style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
      <style>
        :root { color-scheme: light; overflow-y: hidden; }
        #miwa-content { display: flow-root; }
        body { margin: 0; padding: 2px; font: 14px -apple-system, BlinkMacSystemFont, sans-serif; color: #202124; background: #ffffff; line-height: 1.5; overflow-wrap: anywhere; }
        pre { white-space: pre-wrap; margin: 0; font: inherit; }
        img { max-width: 100%; height: auto; }
        blockquote { margin-left: 12px; padding-left: 10px; border-left: 2px solid -apple-system-separator; color: -apple-system-secondary-label; }
        a { color: -apple-system-link; }
      </style>
    </head><body><div id="miwa-content">\(body)</div></body></html>
    """
    webView.loadHTMLString(document, baseURL: nil)
  }

  public func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard navigationAction.navigationType == .linkActivated,
          let url = navigationAction.request.url,
          ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") else {
      decisionHandler(navigationAction.request.url?.scheme == "about" ? .allow : .cancel)
      return
    }
    NSWorkspace.shared.open(url)
    decisionHandler(.cancel)
  }

  private func escape(_ value: String) -> String {
    value
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
  }
}

private final class MailHeightObserver: NSObject, WKScriptMessageHandler {
  var onHeight: ((Double) -> Void)?

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let height = message.body as? Double, height.isFinite, height > 0 else { return }
    onHeight?(height)
  }
}

private final class MailWebView: WKWebView {
  override func scrollWheel(with event: NSEvent) {
    if abs(event.scrollingDeltaY) >= abs(event.scrollingDeltaX) {
      nextResponder?.scrollWheel(with: event)
    } else {
      super.scrollWheel(with: event)
    }
  }
}
