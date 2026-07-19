import { Host, Image } from '@expo/ui/swift-ui';
import { useState, type ComponentProps } from 'react';
import {
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type SymbolName = ComponentProps<typeof Image>['systemName'];

export type SidebarItemId =
  | 'inbox'
  | 'today'
  | 'starred'
  | 'notes'
  | 'archive'
  | 'trash';

type SidebarItem = {
  id: SidebarItemId;
  label: string;
  symbol: SymbolName;
  count?: number;
};

const FAVORITES: SidebarItem[] = [
  { id: 'inbox', label: 'Inbox', symbol: 'tray.full', count: 12 },
  { id: 'today', label: 'Today', symbol: 'calendar', count: 3 },
  { id: 'starred', label: 'Starred', symbol: 'star.fill' },
];

const LIBRARY: SidebarItem[] = [
  { id: 'notes', label: 'All Notes', symbol: 'note.text' },
  { id: 'archive', label: 'Archive', symbol: 'archivebox' },
  { id: 'trash', label: 'Recently Deleted', symbol: 'trash' },
];

type SystemIconProps = {
  name: SymbolName;
  size?: number;
  color?: string;
};

export function SystemIcon({ name, size = 15, color = 'accent' }: SystemIconProps) {
  return (
    <Host style={styles.iconHost}>
      <Image color={color} size={size} systemName={name} />
    </Host>
  );
}

type SidebarSectionProps = {
  title: string;
  items: SidebarItem[];
  selection: SidebarItemId;
  onSelect: (item: SidebarItemId) => void;
};

function SidebarSection({ title, items, selection, onSelect }: SidebarSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <SystemIcon
          color="gray"
          name={expanded ? 'chevron.down' : 'chevron.right'}
          size={9}
        />
        <Text style={styles.sectionTitle}>{title}</Text>
      </Pressable>

      {expanded
        ? items.map((item) => {
            const selected = selection === item.id;

            return (
              <Pressable
                key={item.id}
                accessibilityLabel={item.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.selectedRow,
                  pressed && !selected && styles.pressedRow,
                ]}
              >
                <SystemIcon
                  color={selected ? 'white' : 'accent'}
                  name={item.symbol}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.rowLabel, selected && styles.selectedRowLabel]}
                >
                  {item.label}
                </Text>
                {item.count ? (
                  <Text style={[styles.count, selected && styles.selectedRowLabel]}>
                    {item.count}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

type MacOSSidebarProps = {
  selection: SidebarItemId;
  onSelect: (item: SidebarItemId) => void;
};

export function MacOSSidebar({ selection, onSelect }: MacOSSidebarProps) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.toolbar} />

      <View style={styles.searchField}>
        <SystemIcon color="gray" name="magnifyingglass" size={12} />
        <TextInput
          accessibilityLabel="Search library"
          placeholder="Search"
          placeholderTextColor={PlatformColor('tertiaryLabelColor')}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <SidebarSection
          items={FAVORITES}
          onSelect={onSelect}
          selection={selection}
          title="Favorites"
        />
        <SidebarSection
          items={LIBRARY}
          onSelect={onSelect}
          selection={selection}
          title="Library"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    flex: 1,
    minWidth: 180,
    backgroundColor: 'transparent',
  },
  toolbar: {
    height: 52,
  },
  searchField: {
    height: 28,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: PlatformColor('controlBackgroundColor'),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  searchInput: {
    flex: 1,
    height: 28,
    padding: 0,
    color: PlatformColor('labelColor'),
    fontSize: 12,
  },
  sidebarContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 14,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    gap: 2,
  },
  sectionHeader: {
    height: 24,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sectionTitle: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    fontWeight: '600',
  },
  row: {
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  selectedRow: {
    backgroundColor: PlatformColor('controlAccentColor'),
  },
  pressedRow: {
    backgroundColor: PlatformColor('quaternaryLabelColor'),
  },
  pressed: {
    opacity: 0.65,
  },
  rowLabel: {
    flex: 1,
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '500',
  },
  selectedRowLabel: {
    color: '#ffffff',
  },
  count: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  iconHost: {
    width: 18,
    height: 18,
  },
});
