// src/store/slices/hotelsSlice.ts
import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { hotelService } from '../../services/supabase.service';
import {
  Hotel,
  HotelMenuItem,
  HotelWithMenu,
  CreateHotelRequest,
  CreateMenuItemRequest,
} from '../../types/database.types';
import { storageService } from '../../services/storage.service';
import { syncService } from '../../services/sync.service';

interface HotelsState {
  hotels: HotelWithMenu[];
  selectedHotel: HotelWithMenu | null;
  loading: boolean;
  error: string | null;
}

const initialState: HotelsState = {
  hotels: [],
  selectedHotel: null,
  loading: false,
  error: null,
};

// Async thunks
export const fetchHotels = createAsyncThunk(
  'hotels/fetchHotels',
  async (_, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const hotels = await hotelService.getHotels();
        await storageService.setHotels(hotels);
        return hotels;
      } catch (error: any) {
        console.warn('Online fetch hotels failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedHotels = await storageService.getHotels();
    if (cachedHotels) {
      return cachedHotels;
    }
    
    return [];
  }
);

export const fetchHotel = createAsyncThunk(
  'hotels/fetchHotel',
  async (hotelId: string) => {
    return await hotelService.getHotel(hotelId);
  }
);

export const createHotel = createAsyncThunk(
  'hotels/createHotel',
  async (request: CreateHotelRequest, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const hotel = await hotelService.createHotel(request);
        const hotelWithDetails = await hotelService.getHotel(hotel.id);
        const currentHotels = await storageService.getHotels() || [];
        await storageService.setHotels([hotelWithDetails, ...currentHotels]);
        return hotelWithDetails;
      } catch (error: any) {
        console.warn('Online create hotel failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: create temporary hotel and queue for sync
    const tempHotel: HotelWithMenu = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: request.name,
      location: request.location || null,
      phone: request.phone || null,
      created_by: '',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      menu_items: [],
    };
    
    await syncService.addToQueue('create', 'hotel', request);
    const currentHotels = await storageService.getHotels() || [];
    await storageService.setHotels([tempHotel, ...currentHotels]);
    
    return tempHotel;
  }
);

export const createMenuItem = createAsyncThunk(
  'hotels/createMenuItem',
  async (request: CreateMenuItemRequest) => {
    const menuItem = await hotelService.createMenuItem(request);
    return { hotelId: request.hotel_id, menuItem };
  }
);

export const updateMenuItem = createAsyncThunk(
  'hotels/updateMenuItem',
  async ({ itemId, updates }: { itemId: string; updates: Partial<HotelMenuItem> }) => {
    return await hotelService.updateMenuItem(itemId, updates);
  }
);

// Cache setter action - load data directly from cache without API calls
export const setHotelsFromCache = createAction<HotelWithMenu[]>('hotels/setFromCache');

export const deleteMenuItem = createAsyncThunk(
  'hotels/deleteMenuItem',
  async (itemId: string) => {
    await hotelService.deleteMenuItem(itemId);
    return itemId;
  }
);

const hotelsSlice = createSlice({
  name: 'hotels',
  initialState,
  reducers: {
    setSelectedHotel: (state, action: PayloadAction<HotelWithMenu | null>) => {
      state.selectedHotel = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearHotels: (state) => {
      state.hotels = [];
      state.selectedHotel = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch hotels
    builder.addCase(fetchHotels.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchHotels.fulfilled, (state, action) => {
      state.loading = false;
      state.hotels = action.payload;
    });
    builder.addCase(fetchHotels.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to fetch hotels';
    });

    // Fetch single hotel
    builder.addCase(fetchHotel.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchHotel.fulfilled, (state, action) => {
      state.loading = false;
      state.selectedHotel = action.payload;
    });
    builder.addCase(fetchHotel.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to fetch hotel';
    });

    // Create hotel
    builder.addCase(createHotel.fulfilled, (state, action) => {
      state.hotels.push(action.payload);
      state.hotels.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Create menu item
    builder.addCase(createMenuItem.fulfilled, (state, action) => {
      const { hotelId, menuItem } = action.payload;
      
      // Update in hotels array
      const hotel = state.hotels.find(h => h.id === hotelId);
      if (hotel && hotel.menu_items) {
        hotel.menu_items.push(menuItem);
      }

      // Update selected hotel
      if (state.selectedHotel && state.selectedHotel.id === hotelId) {
        state.selectedHotel.menu_items.push(menuItem);
      }
    });

    // Update menu item
    builder.addCase(updateMenuItem.fulfilled, (state, action) => {
      const updatedItem = action.payload;

      // Update in hotels array
      state.hotels.forEach(hotel => {
        const itemIndex = hotel.menu_items?.findIndex(item => item.id === updatedItem.id);
        if (itemIndex !== undefined && itemIndex !== -1 && hotel.menu_items) {
          hotel.menu_items[itemIndex] = updatedItem;
        }
      });

      // Update in selected hotel
      if (state.selectedHotel) {
        const itemIndex = state.selectedHotel.menu_items.findIndex(
          item => item.id === updatedItem.id
        );
        if (itemIndex !== -1) {
          state.selectedHotel.menu_items[itemIndex] = updatedItem;
        }
      }
    });

    // Delete menu item
    builder.addCase(deleteMenuItem.fulfilled, (state, action) => {
      const deletedItemId = action.payload;

      // Remove from hotels array
      state.hotels.forEach(hotel => {
        if (hotel.menu_items) {
          hotel.menu_items = hotel.menu_items.filter(item => item.id !== deletedItemId);
        }
      });

      // Remove from selected hotel
      if (state.selectedHotel) {
        state.selectedHotel.menu_items = state.selectedHotel.menu_items.filter(
          item => item.id !== deletedItemId
        );
      }
    });
    // Cache setter action
    builder.addCase(setHotelsFromCache, (state, action) => {
      state.hotels = action.payload;
      state.loading = false;
    });
  },
});

export const { setSelectedHotel, clearError, clearHotels } = hotelsSlice.actions;
export default hotelsSlice.reducer;