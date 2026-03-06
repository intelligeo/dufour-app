import { configureStore, createSlice } from '@reduxjs/toolkit';

// Simple locale slice
const localeSlice = createSlice({
  name: 'locale',
  initialState: {
    current: 'en-US'
  },
  reducers: {
    setLocale: (state, action) => {
      state.current = action.payload;
    }
  }
});

// Simple map slice
const mapSlice = createSlice({
  name: 'map',
  initialState: {
    center: null,
    zoom: 8,
    scale: null
  },
  reducers: {
    setMapView: (state, action) => {
      state.center = action.payload.center;
      state.zoom = action.payload.zoom;
      state.scale = action.payload.scale;
    }
  }
});

// Simple task slice for active tool tracking
const taskSlice = createSlice({
  name: 'task',
  initialState: {
    id: null
  },
  reducers: {
    setActiveTask: (state, action) => {
      state.id = action.payload;
    }
  }
});

// App slice for projects and theme management
const appSlice = createSlice({
  name: 'app',
  initialState: {
    projects: [],
    currentProject: null,
    themeConfig: null,
    layers: []
  },
  reducers: {
    setProjects: (state, action) => {
      state.projects = action.payload;
    },
    setCurrentProject: (state, action) => {
      state.currentProject = action.payload;
    },
    setThemeConfig: (state, action) => {
      state.themeConfig = action.payload;
    },
    setLayers: (state, action) => {
      state.layers = action.payload;
    }
  }
});

const store = configureStore({
  reducer: {
    locale: localeSlice.reducer,
    map: mapSlice.reducer,
    task: taskSlice.reducer,
    app: appSlice.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['map/setMapView'],
        // Ignore these paths in the state
        ignoredPaths: ['map.center']
      }
    })
});

export const { setLocale } = localeSlice.actions;
export const { setMapView } = mapSlice.actions;
export const { setActiveTask } = taskSlice.actions;
export const { setProjects, setCurrentProject, setThemeConfig, setLayers } = appSlice.actions;

export default store;
