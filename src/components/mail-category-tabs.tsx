import { Host, Picker } from '@expo/ui/swift-ui';

import type { MailViewFilter } from '../mail/types';
import { mailCategoryTabs } from './mail-category-tab-data';

type MailCategoryTabsProps = {
  selection: MailViewFilter;
  onSelect: (category: MailViewFilter) => void;
};

export function MailCategoryTabs({ selection, onSelect }: MailCategoryTabsProps) {
  const selectedIndex = mailCategoryTabs.findIndex((tab) => tab.id === selection);

  return (
    <Host style={{ width: 220, height: 42, marginVertical: 10 }}>
      <Picker
        label="Mailbox view"
        options={mailCategoryTabs.map((tab) => tab.label)}
        selectedIndex={selectedIndex}
        variant="segmented"
        onOptionSelected={({ nativeEvent }) => {
          const tab = mailCategoryTabs[nativeEvent.index];
          if (tab) onSelect(tab.id);
        }}
      />
    </Host>
  );
}
