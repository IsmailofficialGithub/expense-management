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

  // Calculate safe area spacing
  // For screens with headers, use marginTop instead of paddingTop to avoid pushing content
  // For screens without headers, use paddingTop for safe area
  const topSpacing = hasHeader ? 0 : insets.top;
  const marginTop = hasHeader ? Math.max(insets.top + 8, 24) : 0; // Increased margin for headers
  const bottomPadding = hasTabBar 
    ? (Platform.OS === 'ios' ? 100 : 80) 
    : Math.max(insets.bottom + 40, Platform.OS === 'ios' ? 40 : 60);

  // Merge with user's contentContainerStyle, ensuring our spacing is applied
  const mergedStyle = [
    styles.content,
    contentContainerStyle, // User's styles first
    {
      // Apply safe area spacing last to ensure it's not overridden
      paddingTop: topSpacing,
      marginTop: marginTop,
      paddingBottom: bottomPadding,
    },
  ];

  return (
    <ScrollView
      {...props}
      contentContainerStyle={mergedStyle}
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