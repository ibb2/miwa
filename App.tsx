import { Button, Host } from '@expo/ui/swift-ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NativeSplitView } from './modules/native-split-view/src';

export default function App() {
  const [selection, setSelection] = useState('Inbox');
  const [saveCount, setSaveCount] = useState(0);

  return (
    <NativeSplitView
      style={styles.container}
      orientation="horizontal"
      dividerStyle="thin"
    >
      <View style={[styles.pane, styles.sidebar]}>
        <Text style={styles.eyebrow}>MIWA</Text>
        <Text style={styles.heading}>Library</Text>
        {['Inbox', 'Today', 'Archive'].map((item) => (
          <Pressable
            key={item}
            onPress={() => setSelection(item)}
            style={[styles.row, selection === item && styles.selectedRow]}
          >
            <Text style={styles.rowText}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.pane, styles.listPane]}>
        <Text style={styles.eyebrow}>{selection.toUpperCase()}</Text>
        <Text style={styles.heading}>Native Split View</Text>
        <Text style={styles.body}>
          Drag either divider. Every pane is a React Native child mounted
          inside AppKit's NSSplitView.
        </Text>
      </View>

      <View style={[styles.pane, styles.detailPane]}>
        <Text style={styles.eyebrow}>EXPO UI · MACOS</Text>
        <Text style={styles.title}>The macOS bridge is live.</Text>
        <Text style={styles.body}>
          This button is the SDK 54 @expo/ui component rendered by the local
          macOS Expo module.
        </Text>
        <Host style={styles.buttonHost}>
          <Button onPress={() => setSaveCount((count) => count + 1)}>
            {`Save changes${saveCount ? ` (${saveCount})` : ''}`}
          </Button>
        </Host>
      </View>
    </NativeSplitView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  pane: {
    flex: 1,
    padding: 24,
  },
  sidebar: {
    minWidth: 180,
    backgroundColor: '#e8e8ed',
  },
  listPane: {
    minWidth: 260,
    backgroundColor: '#f5f5f7',
  },
  detailPane: {
    minWidth: 360,
    backgroundColor: '#ffffff',
  },
  eyebrow: {
    marginBottom: 8,
    color: '#6e6e73',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heading: {
    marginBottom: 20,
    color: '#1d1d1f',
    fontSize: 24,
    fontWeight: '700',
  },
  title: {
    marginBottom: 12,
    color: '#1d1d1f',
    fontSize: 32,
    fontWeight: '700',
  },
  body: {
    maxWidth: 520,
    color: '#515154',
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectedRow: {
    backgroundColor: '#d2d2d7',
  },
  rowText: {
    color: '#1d1d1f',
    fontSize: 14,
  },
  buttonHost: {
    width: 180,
    height: 36,
    marginTop: 24,
  },
});
