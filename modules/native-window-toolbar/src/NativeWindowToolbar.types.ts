import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type ToolbarDisplayMode = 'default' | 'iconOnly' | 'labelOnly' | 'iconAndLabel';
export type WindowToolbarStyle =
  'automatic' | 'expanded' | 'preference' | 'unified' | 'unifiedCompact';

export type ToolbarMenuOption = {
  id: string;
  label: string;
  systemImage?: string;
  enabled?: boolean;
  state?: 'off' | 'on' | 'mixed';
};

type ToolbarItemBase = {
  id: string;
  label?: string;
  paletteLabel?: string;
  toolTip?: string;
  enabled?: boolean;
  immovable?: boolean;
  navigational?: boolean;
};

export type ToolbarButtonItem = ToolbarItemBase & {
  kind: 'button';
  systemImage: string;
  badgeCount?: number;
};

export type ToolbarSpaceItem = ToolbarItemBase & {
  kind: 'space' | 'flexibleSpace';
};

export type ToolbarMenuItem = ToolbarItemBase & {
  kind: 'menu';
  systemImage: string;
  options: ToolbarMenuOption[];
};

export type ToolbarProgressItem = ToolbarItemBase & {
  kind: 'progress';
  progress?: number;
  indeterminate?: boolean;
};

export type ToolbarSegment = {
  id: string;
  label?: string;
  systemImage?: string;
  imageData?: string;
  fallbackText?: string;
};

export type ToolbarSegmentedItem = ToolbarItemBase & {
  kind: 'segmented';
  segments: ToolbarSegment[];
  selectedIndex?: number;
  selectionMode?: 'momentary' | 'selectOne' | 'selectAny';
};

export type ToolbarSearchItem = ToolbarItemBase & {
  kind: 'search';
  value: string;
  placeholder?: string;
};

export type NativeToolbarItem =
  | ToolbarSearchItem
  | ToolbarButtonItem
  | ToolbarSpaceItem
  | ToolbarMenuItem
  | ToolbarProgressItem
  | ToolbarSegmentedItem;

export type ToolbarItemPressEvent = NativeSyntheticEvent<{ id: string }>;
export type ToolbarMenuItemPressEvent = NativeSyntheticEvent<{
  id: string;
  optionId: string;
}>;
export type ToolbarSegmentChangeEvent = NativeSyntheticEvent<{
  id: string;
  segmentId: string;
  selectedIndex: number;
}>;
export type NativeWindowToolbarProps = ViewProps & {
  identifier: string;
  items: NativeToolbarItem[];
  customizable?: boolean;
  autosavesConfiguration?: boolean;
  displayMode?: ToolbarDisplayMode;
  toolbarStyle?: WindowToolbarStyle;
  visible?: boolean;
  onSearchChange?: (event: NativeSyntheticEvent<{ id: string; text: string }>) => void;
  onItemPress?: (event: ToolbarItemPressEvent) => void;
  onMenuItemPress?: (event: ToolbarMenuItemPressEvent) => void;
  onSegmentChange?: (event: ToolbarSegmentChangeEvent) => void;
};

export type NativeWindowToolbarRef = {
  showCustomizationPalette(): Promise<void>;
  resetConfiguration(): Promise<void>;
};
