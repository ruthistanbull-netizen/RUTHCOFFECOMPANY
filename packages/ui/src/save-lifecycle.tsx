"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Modal } from "./overlays";
import { Button } from "./primitives";

export type SaveLifecyclePhase =
  | "clean"
  | "dirty"
  | "validating"
  | "saving"
  | "saved"
  | "error";

export type SaveLifecycleSource = {
  id: string;
  dirty: boolean;
  validate?: () => boolean | Promise<boolean>;
  save: () => boolean | void | Promise<boolean | void>;
  discard: () => void | Promise<void>;
};

export type SaveLifecycleTransition = () => void | Promise<void>;

export type SaveLifecycleContextValue = {
  phase: SaveLifecyclePhase;
  dirty: boolean;
  dirtyCount: number;
  saving: boolean;
  transitionPending: boolean;
  error: string | null;
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
  requestTransition: (transition: SaveLifecycleTransition) => Promise<boolean>;
};

type SourceRef = MutableRefObject<SaveLifecycleSource>;
type PendingTransition = {
  transition: SaveLifecycleTransition;
  resolve: (continued: boolean) => void;
};
type TransitionAction = "save" | "discard" | null;
type SaveLifecycleInternalContextValue = SaveLifecycleContextValue & {
  registerSource: (id: string, sourceRef: SourceRef) => () => void;
  notifySourceChange: () => void;
};

export type SaveLifecycleProviderProps = {
  children: ReactNode;
  onError?: (error: Error) => void;
};

const SaveLifecycleContext = createContext<SaveLifecycleInternalContextValue | null>(null);

function asError(value: unknown) {
  return value instanceof Error ? value : new Error("Değişiklikler kaydedilemedi.");
}

export function SaveLifecycleProvider({ children, onError }: SaveLifecycleProviderProps) {
  const sourcesRef = useRef(new Map<string, SourceRef>());
  const operationRef = useRef<Promise<boolean> | null>(null);
  const pendingTransitionRef = useRef<PendingTransition | null>(null);
  const [revision, setRevision] = useState(0);
  const [phase, setPhase] = useState<SaveLifecyclePhase>("clean");
  const [error, setError] = useState<string | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionAction, setTransitionAction] = useState<TransitionAction>(null);
  const transitionBusy = transitionAction !== null;

  const notifySourceChange = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const registerSource = useCallback((id: string, sourceRef: SourceRef) => {
    sourcesRef.current.set(id, sourceRef);
    notifySourceChange();

    return () => {
      const current = sourcesRef.current.get(id);
      if (current !== sourceRef) return;
      sourcesRef.current.delete(id);
      notifySourceChange();
    };
  }, [notifySourceChange]);

  const dirtySources = useMemo(
    () => Array.from(sourcesRef.current.values()).map((sourceRef) => sourceRef.current).filter((source) => source.dirty),
    [revision],
  );
  const dirtyCount = dirtySources.length;
  const dirty = dirtyCount > 0;

  useEffect(() => {
    if (phase === "validating" || phase === "saving") return;
    if (dirty && phase !== "dirty" && phase !== "error") setPhase("dirty");
    if (!dirty && phase !== "saved" && phase !== "clean") setPhase("clean");
  }, [dirty, phase]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useCallback(async () => {
    if (operationRef.current) return operationRef.current;

    const operation = (async () => {
      const currentDirtySources = Array.from(sourcesRef.current.values())
        .map((sourceRef) => sourceRef.current)
        .filter((source) => source.dirty);
      if (!currentDirtySources.length) {
        setError(null);
        setPhase("clean");
        return true;
      }

      setError(null);
      setPhase("validating");

      try {
        const validationResults = await Promise.all(
          currentDirtySources.map(async (source) => source.validate ? source.validate() : true),
        );
        if (validationResults.some((result) => result === false)) {
          setPhase("dirty");
          return false;
        }

        setPhase("saving");
        const results = await Promise.all(currentDirtySources.map((source) => source.save()));
        if (results.some((result) => result === false)) {
          throw new Error("Değişikliklerden en az biri kaydedilemedi.");
        }

        setPhase("saved");
        return true;
      } catch (caught) {
        const nextError = asError(caught);
        setError(nextError.message);
        setPhase("error");
        onError?.(nextError);
        return false;
      }
    })();

    operationRef.current = operation;
    try {
      return await operation;
    } finally {
      operationRef.current = null;
    }
  }, [onError]);

  const discard = useCallback(async () => {
    const currentDirtySources = Array.from(sourcesRef.current.values())
      .map((sourceRef) => sourceRef.current)
      .filter((source) => source.dirty);
    await Promise.all(currentDirtySources.map((source) => source.discard()));
    setError(null);
    setPhase("clean");
  }, []);

  const finishTransition = useCallback((continued: boolean) => {
    const pending = pendingTransitionRef.current;
    pendingTransitionRef.current = null;
    setTransitionOpen(false);
    setTransitionAction(null);
    pending?.resolve(continued);
  }, []);

  const runPendingTransition = useCallback(async () => {
    const pending = pendingTransitionRef.current;
    if (!pending) return;
    await pending.transition();
    finishTransition(true);
  }, [finishTransition]);

  const requestTransition = useCallback((transition: SaveLifecycleTransition) => {
    const hasDirtySource = Array.from(sourcesRef.current.values()).some((sourceRef) => sourceRef.current.dirty);
    if (!hasDirtySource) {
      return Promise.resolve(transition()).then(() => true);
    }

    if (pendingTransitionRef.current) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      pendingTransitionRef.current = { transition, resolve };
      setTransitionOpen(true);
    });
  }, []);

  const continueEditing = useCallback(() => {
    if (transitionBusy) return;
    finishTransition(false);
  }, [finishTransition, transitionBusy]);

  const discardAndContinue = useCallback(async () => {
    if (transitionBusy) return;
    setTransitionAction("discard");
    try {
      await discard();
      await runPendingTransition();
    } catch (caught) {
      const nextError = asError(caught);
      setError(nextError.message);
      setPhase("error");
      setTransitionAction(null);
      onError?.(nextError);
    }
  }, [discard, onError, runPendingTransition, transitionBusy]);

  const saveAndContinue = useCallback(async () => {
    if (transitionBusy) return;
    setTransitionAction("save");
    const saved = await save();
    if (!saved) {
      setTransitionAction(null);
      return;
    }

    try {
      await runPendingTransition();
    } catch (caught) {
      const nextError = asError(caught);
      setError(nextError.message);
      setPhase("error");
      setTransitionAction(null);
      onError?.(nextError);
    }
  }, [onError, runPendingTransition, save, transitionBusy]);

  const value = useMemo<SaveLifecycleInternalContextValue>(() => ({
    phase,
    dirty,
    dirtyCount,
    saving: phase === "validating" || phase === "saving",
    transitionPending: transitionOpen,
    error,
    save,
    discard,
    requestTransition,
    registerSource,
    notifySourceChange,
  }), [dirty, dirtyCount, discard, error, notifySourceChange, phase, registerSource, requestTransition, save, transitionOpen]);

  return (
    <SaveLifecycleContext.Provider value={value}>
      {children}
      <Modal
        open={transitionOpen}
        title="Kaydedilmemiş değişiklikler var"
        description="Devam etmeden önce değişikliklerini kaydedebilir, atabilir veya düzenlemeye geri dönebilirsin."
        onClose={continueEditing}
        dismissalPolicy="protected-action"
        dismissible={!transitionBusy}
        dialogRole="alertdialog"
        children={null}
        footer={(
          <>
            <Button variant="ghost" size="md" onClick={continueEditing} disabled={transitionBusy} data-autofocus>
              Düzenlemeye devam et
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => void discardAndContinue()}
              loading={transitionAction === "discard"}
              disabled={transitionAction === "save"}
            >
              Değişiklikleri at
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => void saveAndContinue()}
              loading={transitionAction === "save"}
              disabled={transitionAction === "discard"}
            >
              Kaydet ve devam et
            </Button>
          </>
        )}
      />
    </SaveLifecycleContext.Provider>
  );
}

export function useSaveLifecycle() {
  const context = useContext(SaveLifecycleContext);
  if (!context) throw new Error("useSaveLifecycle must be used inside SaveLifecycleProvider");
  const { registerSource: _registerSource, notifySourceChange: _notifySourceChange, ...publicValue } = context;
  return publicValue;
}

export function useSaveLifecycleSource(source: SaveLifecycleSource) {
  const context = useContext(SaveLifecycleContext);
  if (!context) throw new Error("useSaveLifecycleSource must be used inside SaveLifecycleProvider");

  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(
    () => context.registerSource(source.id, sourceRef),
    [context.registerSource, source.id],
  );

  useEffect(() => {
    context.notifySourceChange();
  }, [context.notifySourceChange, source.dirty]);
}
