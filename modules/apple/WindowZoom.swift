import Foundation
#if os(macOS)
import AppKit
#endif

// A double-click on the window's title row, answered as AppKit's own title bar
// answers it: what System Settings › Desktop & Dock › "Double-click a window's
// title bar to" chooses (zoom, minimize, or nothing).
final class WindowZoom: ExactModule {
    override func call(_ request: [String: Any]) -> [String: Any] {
        #if os(macOS)
        guard let window = NSApp.keyWindow ?? NSApp.mainWindow else { return ["ok": false] }
        switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
        case "Minimize": window.performMiniaturize(nil)
        case "None": break
        default: window.zoom(nil)
        }
        return ["ok": true]
        #else
        return ["ok": false]
        #endif
    }

    override func later(_ request: [String: Any], reply: ExactReply) {
        DispatchQueue.main.async { reply.send(self.call(request)) }
    }
}

let exactModule: ExactModule.Type = WindowZoom.self
