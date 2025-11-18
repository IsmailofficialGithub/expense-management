// src/components/SafeScrollView.tsx
import React from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SafeScrollViewProps extends ScrollViewProps {
  children: React.ReactNode;
  hasTabBar?: boolean; // For screens with bottom tab navigation
  hasHeader?: boolean; // For screens with header
}

export default function SafeScrollView({ 
  children, 
  contentContainerStyle, 
  hasTabBar = true,
  hasHeader = true,
  ...props 
}: SafeScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      {...props}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: hasHeader ? 0 : insets.top,
          paddingBottom: hasTabBar 
            ? (Platform.OS === 'ios' ? 100 : 80) 
            : 20,
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});