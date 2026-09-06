import AppKit
import ExpoModulesCore
import WebKit

public final class NativeMailViewerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeMailViewer")

    View(NativeMailViewerView.self) {
      ViewName("NativeMailViewer")
      Events("onContentHeightChange")

      Prop("html") { (view: NativeMailViewerView, html: String?) in
        view.html = html
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

public final class NativeMailViewerView: ExpoView, WKNavigationDelegate {
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
    [{"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}}]
    """
    WKContentRuleListStore.default().compileContentRuleList(
      forIdentifier: "MiwaRemoteMailContent",
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
    guard renderedBody != body else { return }
    renderedBody = body
    let document = """
    <!doctype html>
    <html><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
      <style>
        :root { color-scheme: light dark; overflow-y: hidden; }
        #miwa-content { display: flow-root; }
        body { margin: 0; padding: 2px; font: 14px -apple-system, BlinkMacSystemFont, sans-serif; color: -apple-system-label; background: transparent; line-height: 1.5; overflow-wrap: anywhere; }
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
          ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
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
