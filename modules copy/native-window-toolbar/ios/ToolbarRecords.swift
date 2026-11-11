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
  @Field public var value: String = ""
  @Field public var placeholder: String?
  @Field public var badgeCount: Int?
  @Field public var enabled: Bool = true
  @Field public var immovable: Bool = false
  @Field public var navigational: Bool = false
  @Field public var options: [ToolbarMenuOptionRecord] = []
  @Field public var progress: Double = 0
  @Field public var indeterminate: Bool = false
  @Field public var segments: [ToolbarSegmentRecord] = []
  @Field public var selectedIndex: Int = -1
  @Field public var selectionMode: String = "momentary"
  @Field public var isOn: Bool = false

  public init() {}
}

