import React, { createContext, useContext } from 'react';

interface MapsRuntimeContextValue {
  apiKey: string;
  hasProvider: boolean;
  quotaExceeded: boolean;
}

const MapsRuntimeContext = createContext<MapsRuntimeContextValue>({
  apiKey: '',
  hasProvider: false,
  quotaExceeded: false,
});

export const MapsRuntimeProvider: React.FC<{
  value: MapsRuntimeContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <MapsRuntimeContext.Provider value={value}>{children}</MapsRuntimeContext.Provider>
);

export function useMapsRuntime() {
  return useContext(MapsRuntimeContext);
}
