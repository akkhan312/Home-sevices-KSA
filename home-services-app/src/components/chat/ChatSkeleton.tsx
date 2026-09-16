import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export function ChatSkeleton() {
  return (
    <View style={styles.container}>
      <View style={[styles.bubble, styles.leftBubble]} />
      <View style={[styles.bubble, styles.rightBubble]} />
      <View style={[styles.bubble, styles.leftBubbleShort]} />
      <View style={[styles.bubble, styles.rightBubbleShort]} />
      <View style={[styles.bubble, styles.leftBubble]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 14 },
  bubble: { height: 48, borderRadius: 18, backgroundColor: '#E2E8F0', opacity: 0.6 },
  leftBubble: { width: '70%', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  rightBubble: { width: '65%', alignSelf: 'flex-end', borderBottomRightRadius: 4, backgroundColor: '#CBD5E1' },
  leftBubbleShort: { width: '45%', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  rightBubbleShort: { width: '40%', alignSelf: 'flex-end', borderBottomRightRadius: 4, backgroundColor: '#CBD5E1' },
});
