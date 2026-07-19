import AppKit
import ExpoModulesCore

public final class NativeSplitViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeSplitView")

    View(NativeSplitView.self) {
      ViewName("NativeSplitView")

      Prop("orientation") { (view: NativeSplitView, orientation: String) in
        view.orientation = orientation
      }

      Prop("dividerStyle") { (view: NativeSplitView, dividerStyle: String) in
        view.dividerStyle = dividerStyle
      }

      Prop("initialPaneSizes") { (view: NativeSplitView, initialPaneSizes: [Double]) in
        view.initialPaneSizes = initialPaneSizes.map { CGFloat($0) }
      }

      Events("onDividerPositionsChange")

      AsyncFunction("setDividerPosition") {
        (view: NativeSplitView, position: Double, dividerIndex: Int) in
        view.setDividerPosition(CGFloat(position), dividerIndex: dividerIndex)
      }

      AsyncFunction("toggleSidebar") { (view: NativeSplitView) in
        view.toggleSidebar()
      }
    }
  }
}
