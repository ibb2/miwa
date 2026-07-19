import { Button, Host } from '@expo/ui/swift-ui';
import { useState } from 'react';
import {
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NativeSplitView } from './modules/native-split-view/src';
import {
  MacOSSidebar,
  type SidebarItemId,
} from './src/components/macos-sidebar';

const PANE_SIZES = [260, 390];

const CONTENT: Record<
  SidebarItemId,
  { title: string; description: string; items: string[] }
> = {
  inbox: {
    title: 'Inbox',
    description: 'Notes waiting for you to sort and shape.',
    items: ['Welcome to Miwa', 'Sidebar design notes', 'Ideas for the weekend'],
  },
  today: {
    title: 'Today',
    description: 'The notes you touched today.',
    items: ['Native Split View', 'Expo UI on macOS', 'Project checklist'],
  },
  starred: {
    title: 'Starred',
    description: 'The notes you want close at hand.',
    items: ['Miwa product direction', 'macOS interaction patterns'],
  },
  notes: {
    title: 'All Notes',
    description: 'Everything in your library.',
    items: ['Welcome to Miwa', 'Native Split View', 'Project checklist'],
  },
  archive: {
    title: 'Archive',
    description: 'Finished notes, kept out of the way.',
    items: ['Original prototype', 'Research roundup'],
  },
  trash: {
    title: 'Recently Deleted',
    description: 'Deleted notes stay here before they are removed.',
    items: ['Untitled note'],
  },
};

export default function App() {
  const [selection, setSelection] = useState<SidebarItemId>('inbox');
  const [saveCount, setSaveCount] = useState(0);
  const current = CONTENT[selection];

  return (
    <NativeSplitView
      style={styles.container}
      orientation="horizontal"
      dividerStyle="thin"
      initialPaneSizes={PANE_SIZES}
    >
      <MacOSSidebar onSelect={setSelection} selection={selection} />

      <View style={styles.listPane}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSpacer} />
          <Text style={styles.toolbarTitle}>{current.title}</Text>
          <View style={styles.toolbarSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.listContent} style={styles.scrollView}>
          <Text style={styles.heading}>{current.title}</Text>
          <Text style={styles.description}>{current.description}</Text>

          <View style={styles.noteList}>
            {current.items.map((item, index) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.noteRow,
                  index === 0 && styles.activeNoteRow,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.noteTitle}>{item}</Text>
                <Text numberOfLines={1} style={styles.notePreview}>
                  {index === 0
                    ? 'A native macOS workspace built with Expo and React Native.'
                    : 'A short preview of this note appears here.'}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.detailPane}>
        <ScrollView contentContainerStyle={styles.detailContent} style={styles.scrollView}>
          <Text style={styles.eyebrow}>EXPO UI · MACOS</Text>
          <Text style={styles.title}>A sidebar that feels at home.</Text>
          <Text style={styles.body}>
            Miwa now uses a compact leading sidebar for top-level navigation,
            familiar SF Symbols, disclosure groups, and the system accent color.
          </Text>
          <Text style={[styles.body, styles.secondaryBody]}>
            The workspace is hosted by AppKit's NSSplitViewController. Its first
            pane is a real system sidebar with native glass, resizing, and collapse
            behavior.
          </Text>
          <Host style={styles.buttonHost}>
            <Button onPress={() => setSaveCount((count) => count + 1)}>
              {`Save changes${saveCount ? ` (${saveCount})` : ''}`}
            </Button>
          </Host>
        </ScrollView>
      </View>
    </NativeSplitView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PlatformColor('windowBackgroundColor'),
  },
  listPane: {
    flex: 1,
    minWidth: 300,
    backgroundColor: PlatformColor('windowBackgroundColor'),
  },
  detailPane: {
    flex: 1,
    minWidth: 340,
    backgroundColor: PlatformColor('textBackgroundColor'),
  },
  toolbar: {
    height: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separatorColor'),
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarTitle: {
    flex: 1,
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  toolbarSpacer: {
    width: 28,
  },
  listContent: {
    padding: 24,
  },
  scrollView: {
    flex: 1,
  },
  detailContent: {
    paddingHorizontal: 36,
    paddingTop: 72,
    paddingBottom: 36,
  },
  heading: {
    color: PlatformColor('labelColor'),
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  description: {
    marginTop: 5,
    marginBottom: 22,
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 13,
    lineHeight: 18,
  },
  noteList: {
    gap: 4,
  },
  noteRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 7,
    gap: 3,
  },
  activeNoteRow: {
    backgroundColor: PlatformColor('selectedContentBackgroundColor'),
  },
  noteTitle: {
    color: PlatformColor('labelColor'),
    fontSize: 14,
    fontWeight: '600',
  },
  notePreview: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 12,
  },
  eyebrow: {
    marginBottom: 8,
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginBottom: 12,
    color: PlatformColor('labelColor'),
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  body: {
    maxWidth: 520,
    color: PlatformColor('labelColor'),
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryBody: {
    marginTop: 12,
    color: PlatformColor('secondaryLabelColor'),
  },
  buttonHost: {
    width: 180,
    height: 36,
    marginTop: 24,
  },
  pressed: {
    opacity: 0.65,
  },
});
