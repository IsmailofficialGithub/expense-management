import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

type Props = { icon?: string | null; size?: number; color?: string | null; style?: StyleProp<TextStyle> };

// Category icons are MaterialCommunityIcons names stored in the DB. Anything else (old emoji rows,
// stale cached data) falls back to a generic icon. A fontSize/color in `style` overrides size/color.
export default function CategoryIcon({ icon, size = 24, color, style }: Props) {
  const theme = useTheme();
  const name = icon && icon in MaterialCommunityIcons.glyphMap ? icon : 'cash';
  return <MaterialCommunityIcons name={name as any} size={size} color={color || theme.colors.primary} style={style} />;
}
