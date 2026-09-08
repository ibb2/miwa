import AppKit
import ExpoModulesCore

public final class NativeWindowToolbarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeWindowToolbar")

    View(NativeWindowToolbarView.self) {
      ViewName("NativeWindowToolbar")

      Prop("identifier") { (view: NativeWindowToolbarView, identifier: String) in
        view.toolbarIdentifier = identifier
      }

      Prop("items") { (view: NativeWindowToolbarView, items: [ToolbarItemRecord]) in
        view.items = items
      }

      Prop("customizable") { (view: NativeWindowToolbarView, customizable: Bool) in
        view.customizable = customizable
      }

      Prop("autosavesConfiguration") {
        (view: NativeWindowToolbarView, autosavesConfiguration: Bool) in
        view.autosavesConfiguration = autosavesConfiguration
      }

      Prop("displayMode") { (view: NativeWindowToolbarView, displayMode: String) in
        view.displayMode = displayMode
      }

      Prop("toolbarStyle") { (view: NativeWindowToolbarView, toolbarStyle: String) in
        view.toolbarStyle = toolbarStyle
      }

      Prop("visible") { (view: NativeWindowToolbarView, visible: Bool) in
        view.toolbarVisible = visible
      }

      Events(
        "onContentInsetChange",
        "onItemPress",
        "onMenuItemPress",
        "onSegmentChange",
        "onSearchChange"
      )

      OnViewDidUpdateProps { (view: NativeWindowToolbarView) in
        view.applyConfiguration()
      }

      AsyncFunction("showCustomizationPalette") { (view: NativeWindowToolbarView) in
        view.showCustomizationPalette()
      }

      AsyncFunction("resetConfiguration") { (view: NativeWindowToolbarView) in
        view.resetConfiguration()
      }
    }
  }
}
