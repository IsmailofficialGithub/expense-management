import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Avatar } from 'react-native-paper';

type Props = {
  user?: { full_name?: string | null; avatar_url?: string | null } | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  color?: string; // initials text color (fallback only)
};

// A person's picture (uploaded or the generated default), falling back to their initials.
export default function UserAvatar({ user, size = 40, style, color }: Props) {
  if (user?.avatar_url) return <Avatar.Image size={size} source={{ uri: user.avatar_url }} style={style} />;
  return <Avatar.Text size={size} label={user?.full_name?.substring(0, 2).toUpperCase() || 'U'} style={style} color={color} />;
}
