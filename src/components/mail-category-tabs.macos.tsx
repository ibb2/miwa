import { Host, Image } from '@expo/ui/swift-ui';
import type { ComponentProps } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MailCategoryFilter } from '../mail/types';
import { mailCategoryTabs } from './mail-category-tab-data';

type SymbolName = ComponentProps<typeof Image>['systemName'];

type MailCategoryTabsProps = {
  selection: MailCategoryFilter;
  onSelect: (category: MailCategoryFilter) => void;
};

export function MailCategoryTabs({ selection, onSelect }: MailCategoryTabsProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {mailCategoryTabs.map((tab) => {
          const selected = tab.id === selection;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab.id}
              onPress={() => onSelect(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.selectedTab,
                pressed && styles.pressedTab,
              ]}
            >
              <Host style={styles.iconHost}>
                <Image
                  color={selected ? 'white' : 'gray'}
                  size={13}
                  systemName={tab.systemImage as SymbolName}
                />
              </Host>
              <Text style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: PlatformColor('windowBackgroundColor'),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separatorColor'),
  },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 4 },
  tab: {
    height: 31,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedTab: { backgroundColor: PlatformColor('controlAccentColor') },
  pressedTab: { opacity: 0.68 },
  iconHost: { width: 14, height: 16 },
  label: { color: PlatformColor('secondaryLabelColor'), fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: PlatformColor('selectedMenuItemTextColor') },
});
