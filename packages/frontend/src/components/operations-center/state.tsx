/**
 * Operations state provider and hook.
 *
 * Wraps the app with a context that holds the current OperationsData snapshot
 * and exposes action methods that call the mock API.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { OperationsState, ListingStatus, UUID, StrayQueue, TaskStatus, OperationsData } from "./types";
import {
  fetchOperationsState,
  apiUpdateListingStatus,
  apiClaimTask,
  apiUnclaimTask,
  apiMarkTaskDone,
  apiDeferTask,
  apiAddNote,
  apiMoveStrayTask,
  apiUpdateTaskOutput,
  apiUpdateTaskStatus,
} from "./api";

const OperationsContext = createContext<OperationsState | undefined>(undefined);

/**
 * Access the Operations context.
 *
 * @throws Error if called outside of OperationsProvider
 */
export const useOperations = () => {
  const ctx = useContext(OperationsContext);
  if (!ctx) throw new Error("useOperations must be used within OperationsProvider");
  return ctx;
};

const emptyOperationsData: OperationsData = {
  agents: [],
  playbooks: [],
  listings: [],
  tasks: [],
  notes: [],
  attachments: [],
  history: [],
  workItems: [],
};

/**
 * Provide Operations state and actions to descendants.
 */
export const OperationsProvider = ({ children }: { children: React.ReactNode }) => {
  const [data, setData] = useState<OperationsData>(emptyOperationsData);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const run = useCallback((operation: () => Promise<OperationsData>) => {
    setIsLoading(true);
    operation()
      .then(setData)
      .catch((error) => {
        console.error("OperationsProvider action failed", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const refresh = useCallback(() => {
    run(() => fetchOperationsState());
  }, [run]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<OperationsState>(() => ({
    ...data,
    isLoading,
    refresh,
    updateListingStatus: (listingId: UUID, status: ListingStatus) => {
      run(() => apiUpdateListingStatus(listingId, status));
    },
    claimTask: (taskId: UUID, agentId: UUID) => {
      run(() => apiClaimTask(taskId, agentId));
    },
    unclaimTask: (taskId: UUID) => {
      run(() => apiUnclaimTask(taskId));
    },
    markTaskDone: (taskId: UUID) => {
      run(() => apiMarkTaskDone(taskId));
    },
    deferTask: (taskId: UUID, days: number) => {
      run(() => apiDeferTask(taskId, days));
    },
    addNote: (listingId: UUID, authorId: UUID, body: string) => {
      if (!body.trim()) {
        return;
      }
      run(() => apiAddNote(listingId, authorId, body));
    },
    moveStrayTaskToQueue: (taskId: UUID, queue: StrayQueue) => {
      run(() => apiMoveStrayTask(taskId, queue));
    },
    updateTaskOutput: (taskId: UUID, key: string, value: string) => {
      run(() => apiUpdateTaskOutput(taskId, key, value));
    },
    updateTaskStatus: (taskId: UUID, status: TaskStatus) => {
      run(() => apiUpdateTaskStatus(taskId, status));
    },
  }), [data, isLoading, refresh, run]);

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
};
