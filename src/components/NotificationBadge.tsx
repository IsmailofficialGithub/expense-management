// src/components/NotificationBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

interface NotificationBadgeProps {
  count: number;
  size?: number;
}

export default function NotificationBadge({ count, size = 18 }: NotificationBadgeProps) {
  const theme = useTheme();

  if (count === 0) return null;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: theme.colors.error,
          minWidth: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            fontSize: size * 0.6,
            color: '#fff',
          },
        ]}
      >
        {count > 99 ? '99+' : count.toString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 1,
  },
  badgeText: {
    fontWeight: 'bold',
    color: '#fff',
  },
});

