import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MailCategoryFilter } from '../mail/types';
import { mailCategoryTabs } from './mail-category-tab-data';

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
              <Text style={[styles.fallbackIcon, selected && styles.selectedText]}>
                {tab.fallbackIcon}
              </Text>
              <Text style={[styles.label, selected && styles.selectedText]}>{tab.label}</Text>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.28)',
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
  selectedTab: { backgroundColor: '#E86E5A' },
  pressedTab: { opacity: 0.68 },
  fallbackIcon: { color: '#6B6B70', fontSize: 10, fontWeight: '800' },
  label: { color: '#54545A', fontSize: 12, fontWeight: '600' },
  selectedText: { color: '#FFFFFF' },
});
