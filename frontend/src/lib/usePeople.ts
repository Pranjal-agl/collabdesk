import { useSyncExternalStore } from 'react';
import { getDirectory, getPeopleVersion, subscribePeople } from './utils';

/** Re-renders the caller whenever names are learned (directory, presence, session). */
export function usePeople() {
  useSyncExternalStore(subscribePeople, getPeopleVersion);
  return getDirectory();
}
