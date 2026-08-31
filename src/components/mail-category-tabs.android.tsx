import { Picker } from '@expo/ui/jetpack-compose';

import type { MailCategoryFilter } from '../mail/types';
import { mailCategoryTabs } from './mail-category-tab-data';

type MailCategoryTabsProps = {
  selection: MailCategoryFilter;
  onSelect: (category: MailCategoryFilter) => void;
};

export function MailCategoryTabs({ selection, onSelect }: MailCategoryTabsProps) {
  const selectedIndex = mailCategoryTabs.findIndex((tab) => tab.id === selection);

  return (
    <Picker
      style={{ width: 560, height: 48 }}
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
