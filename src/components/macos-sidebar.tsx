import { Host, Image } from '@expo/ui/swift-ui';
import type { ComponentProps } from 'react';
import { PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native';

type SymbolName = ComponentProps<typeof Image>['systemName'];
export type SidebarItemId = 'inbox';

function SystemIcon({ name, color = 'accent' }: { name: SymbolName; color?: string }) {
  return (
    <Host style={styles.iconHost}>
      <Image color={color} size={15} systemName={name} />
    </Host>
  );
}

type MacOSSidebarProps = {
  selection: SidebarItemId;
  onSelect: (item: SidebarItemId) => void;
  accountCount: number;
};

export function MacOSSidebar({ selection, onSelect, accountCount }: MacOSSidebarProps) {
  const selected = selection === 'inbox';
  return (
    <View style={styles.sidebar}>
      <View style={styles.toolbar} />
      <Text style={styles.sectionTitle}>MAILBOXES</Text>
      <Pressable
        accessibilityLabel="Inbox"
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onSelect('inbox')}
        style={({ pressed }) => [
          styles.row,
          selected && styles.selectedRow,
          pressed && !selected && styles.pressedRow,
        ]}
      >
        <SystemIcon color={selected ? 'white' : 'accent'} name="tray.full" />
        <Text style={[styles.rowLabel, selected && styles.selectedRowLabel]}>Inbox</Text>
      </Pressable>
      <View style={styles.statusCard}>
        <SystemIcon color="gray" name="person.2" />
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>Connected accounts</Text>
          <Text style={styles.statusSubtitle}>
            {accountCount ? `${accountCount} Gmail ${accountCount === 1 ? 'account' : 'accounts'}` : 'None yet'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { flex: 1, minWidth: 180, paddingHorizontal: 8 },
  toolbar: { height: 52 },
  sectionTitle: {
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 5,
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  row: {
    height: 31,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  selectedRow: { backgroundColor: PlatformColor('controlAccentColor') },
  pressedRow: { backgroundColor: PlatformColor('quaternaryLabelColor') },
  rowLabel: { flex: 1, color: PlatformColor('labelColor'), fontSize: 13, fontWeight: '500' },
  selectedRowLabel: { color: '#fff' },
  iconHost: { width: 18, height: 18 },
  statusCard: {
    marginTop: 20,
    marginHorizontal: 5,
    padding: 10,
    borderRadius: 8,
    backgroundColor: PlatformColor('controlBackgroundColor'),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusCopy: { flex: 1, gap: 2 },
  statusTitle: { color: PlatformColor('labelColor'), fontSize: 11, fontWeight: '600' },
  statusSubtitle: { color: PlatformColor('secondaryLabelColor'), fontSize: 10 },
});
