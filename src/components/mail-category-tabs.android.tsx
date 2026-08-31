import { Picker } from '@expo/ui/jetpack-compose';

import type { MailViewFilter } from '../mail/types';
import { mailCategoryTabs } from './mail-category-tab-data';

type MailCategoryTabsProps = {
  selection: MailViewFilter;
  onSelect: (category: MailViewFilter) => void;
};

export function MailCategoryTabs({ selection, onSelect }: MailCategoryTabsProps) {
  const selectedIndex = mailCategoryTabs.findIndex((tab) => tab.id === selection);

  return (
    <Picker
      style={{ width: 220, height: 48 }}
      options={mailCategoryTabs.map((tab) => tab.label)}
      selectedIndex={selectedIndex}
      variant="segmented"
      onOptionSelected={({ nativeEvent }) => {
        const tab = mailCategoryTabs[nativeEvent.index];
        if (tab) onSelect(tab.id);
      }}
    />
  );
}
