// src/services/domain/people.ts
import { api, qs, uploadImage, ApiError } from '../api';
import {
  Profile,
  Group,
  CreateGroupRequest,
  GroupWithMembers,
  UserGroupBalance,
  InviteUserRequest,
  GroupInvitation,
  GroupInvitationWithDetails,
  UserPaymentMethod,
  CreatePaymentMethodRequest,
  HotelMenuItem,
  CreateMenuItemRequest,
  Hotel,
  CreateHotelRequest,
  HotelWithMenu,
} from '../../types/database.types';

// ============================================
// PROFILE
// ============================================

export const profileService = {
  getProfile: async (userId: string): Promise<Profile | null> => {
    try {
      return await api.get<Profile>(`/profiles/${userId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  // Server always updates the logged-in user's profile.
  updateProfile: async (_userId: string, updates: Partial<Profile>) => api.patch<Profile>('/profiles/me', updates),

  // Server deletes the old avatar file when avatar_url changes.
  uploadAvatar: async (imageUri: string): Promise<string> => {
    const url = await uploadImage('avatars', imageUri);
    await api.patch('/profiles/me', { avatar_url: url });
    return url;
  },

  searchProfiles: async (query: string): Promise<Profile[]> =>
    query.trim() ? api.get<Profile[]>(`/profiles/search${qs({ q: query.trim() })}`) : [],
};

// ============================================
// HOTELS SERVICE
// ============================================

export const hotelService = {
  getHotels: (): Promise<HotelWithMenu[]> => api.get('/hotels'),
  getHotel: (hotelId: string): Promise<HotelWithMenu> => api.get(`/hotels/${hotelId}`),
  createHotel: (request: CreateHotelRequest): Promise<Hotel> => api.post('/hotels', request),
  createMenuItem: (request: CreateMenuItemRequest): Promise<HotelMenuItem> => api.post('/hotel-menu-items', request),
  getMenuItems: (hotelId: string): Promise<HotelMenuItem[]> => api.get(`/hotels/${hotelId}/menu-items`),
  updateMenuItem: (itemId: string, updates: Partial<HotelMenuItem>): Promise<HotelMenuItem> => {
    const { item_name, category, price, description, is_available } = updates;
    return api.patch(`/hotel-menu-items/${itemId}`, { item_name, category, price, description, is_available });
  },
  deleteMenuItem: async (itemId: string): Promise<void> => {
    await api.del(`/hotel-menu-items/${itemId}`);
  },
};

// ============================================
// PAYMENT METHODS SERVICE
// ============================================

export const paymentMethodService = {
  getPaymentMethods: (userId: string): Promise<UserPaymentMethod[]> => api.get(`/users/${userId}/payment-methods`),
  async getDefaultPaymentMethod(userId: string): Promise<UserPaymentMethod | null> {
    return (await this.getPaymentMethods(userId)).find((m) => m.is_default) ?? null;
  },
  createPaymentMethod: (request: CreatePaymentMethodRequest): Promise<UserPaymentMethod> => api.post('/payment-methods', request),
  updatePaymentMethod: (methodId: string, updates: Partial<CreatePaymentMethodRequest>): Promise<UserPaymentMethod> =>
    api.patch(`/payment-methods/${methodId}`, updates),
  setDefaultPaymentMethod: (methodId: string): Promise<UserPaymentMethod> => api.post(`/payment-methods/${methodId}/default`),
  deletePaymentMethod: async (methodId: string): Promise<void> => {
    await api.del(`/payment-methods/${methodId}`);
  },
  getGroupMembersPaymentMethods: (groupId: string): Promise<UserPaymentMethod[]> => api.get(`/groups/${groupId}/payment-methods`),
};

// ============================================
// INVITATION SERVICE
// ============================================

export const invitationService = {
  // Server checks admin rights, stores the invitation and emails the invitee.
  inviteUser: (request: InviteUserRequest): Promise<GroupInvitation> =>
    api.post('/invitations', { group_id: request.group_id, invited_email: request.invited_email }),
  getMyInvitations: (groupId: string): Promise<GroupInvitation[]> => api.get(`/groups/${groupId}/invitations`),
  getPendingInvitations: (): Promise<GroupInvitationWithDetails[]> => api.get('/invitations/pending'),
  acceptInvitation: async (invitationId: string): Promise<void> => {
    await api.post(`/invitations/${invitationId}/accept`);
  },
  rejectInvitation: async (invitationId: string): Promise<void> => {
    await api.post(`/invitations/${invitationId}/reject`);
  },
};

// ============================================
// GROUPS
// ============================================

export const groupService = {
  createGroup: (request: CreateGroupRequest): Promise<Group> => api.post('/groups', request),
  getGroups: (): Promise<GroupWithMembers[]> => api.get('/groups'),
  getGroup: (groupId: string): Promise<GroupWithMembers> => api.get(`/groups/${groupId}`),
  updateGroup: (groupId: string, updates: Partial<Group>) =>
    api.patch<Group>(`/groups/${groupId}`, { name: updates.name, description: updates.description }),
  deleteGroup: async (groupId: string) => {
    await api.del(`/groups/${groupId}`);
  },
  addMember: (groupId: string, userId: string, role: 'admin' | 'member' = 'member') =>
    api.post(`/groups/${groupId}/members`, { user_id: userId, role }),
  removeMember: async (groupId: string, userId: string) => {
    await api.del(`/groups/${groupId}/members/${userId}`);
  },
  getGroupBalances: (groupId: string): Promise<UserGroupBalance[]> => api.get(`/groups/${groupId}/balances`),
};

// ============================================
// CATEGORIES
// ============================================

export const categoryService = {
  getCategories: () => api.get('/categories'),
};
